document.addEventListener('DOMContentLoaded', () => {
    const zipFileInput = document.getElementById('zipFile');
    const apiKeyInput = document.getElementById('apiKey');
    const processButton = document.getElementById('processButton');
    const downloadButton = document.getElementById('downloadButton');
    const statusMessages = document.getElementById('statusMessages');

    let extractedDataFromPdfs = [];
    let currentZipFile = null;
    let currentApiKey = '';

    const PDF_RENDER_SCALE = 1.5;
    const JPG_QUALITY = 0.85;

    function updateStatus(message, isError = false) {
        const Sentry = window.Sentry;
        if (isError && Sentry && typeof Sentry.captureMessage === 'function') {
            Sentry.captureMessage(message);
        }
        statusMessages.textContent += (isError ? `FEHLER: ${message}\n` : `${message}\n`);
        statusMessages.scrollTop = statusMessages.scrollHeight;
        console.log(message);
        if (isError) console.error(message);
    }

    function checkCanProcess() {
        if (currentZipFile && currentApiKey && currentApiKey.length > 10) {
            processButton.disabled = false;
        } else {
            processButton.disabled = true;
        }
    }

    zipFileInput.addEventListener('change', (event) => {
        currentZipFile = event.target.files[0];
        if (currentZipFile) {
            updateStatus(`Ausgewählte ZIP-Datei: ${currentZipFile.name}`);
        } else {
            updateStatus('ZIP-Datei abgewählt.');
        }
        extractedDataFromPdfs = [];
        downloadButton.style.display = 'none';
        checkCanProcess();
    });

    apiKeyInput.addEventListener('input', (event) => {
        currentApiKey = event.target.value.trim();
        checkCanProcess();
    });

    processButton.addEventListener('click', async () => {
        if (!currentZipFile || !currentApiKey) {
            updateStatus('Bitte wählen Sie eine ZIP-Datei aus und geben Sie Ihren Google AI API-Schlüssel ein.', true);
            return;
        }

        processButton.disabled = true;
        downloadButton.style.display = 'none';
        extractedDataFromPdfs = [];
        statusMessages.textContent = '';
        updateStatus('Verarbeitung gestartet...');

        try {
            const zip = await JSZip.loadAsync(currentZipFile);
            const pdfFiles = [];
            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.pdf')) {
                    pdfFiles.push(zipEntry);
                }
            });

            if (pdfFiles.length === 0) {
                updateStatus('Keine PDF-Dateien in der ZIP-Datei gefunden.', true);
                checkCanProcess();
                return;
            }

            updateStatus(`${pdfFiles.length} PDF-Datei(en) gefunden. Bilder werden generiert...`);

            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                updateStatus(`Verarbeite ${pdfFile.name} (${i + 1}/${pdfFiles.length})... PDF zu Bild Konvertierung...`);
                try {
                    const arrayBuffer = await pdfFile.async('arraybuffer');
                    const base64Jpg = await convertPdfToStackedJpg(arrayBuffer, pdfFile.name);

                    if (!base64Jpg) {
                        updateStatus(`Konnte kein Bild aus ${pdfFile.name} erstellen. Wird übersprungen.`, true);
                        continue;
                    }
                    updateStatus(`Bild aus ${pdfFile.name} erstellt. Sende an Google Gemini... (Dies kann einige Zeit dauern)`);
                    
                    const extractedInfo = await callGoogleGemini(base64Jpg, currentApiKey, pdfFile.name);
                    
                    if (extractedInfo) {
                        extractedDataFromPdfs.push({ fileName: pdfFile.name, ...extractedInfo });
                        updateStatus(`Daten für ${pdfFile.name} erfolgreich von Gemini extrahiert.`);
                    } else {
                        updateStatus(`Keine Daten von Gemini für ${pdfFile.name} extrahiert oder Fehler bei der Extraktion.`, true);
                    }
                } catch (pdfProcessingError) {
                    updateStatus(`Fehler bei der Verarbeitung von ${pdfFile.name}: ${pdfProcessingError.message}`, true);
                }
            }

            if (extractedDataFromPdfs.length > 0) {
                updateStatus('Alle verarbeitbaren PDFs verarbeitet. Excel-Datei steht zum Download bereit.');
                downloadButton.style.display = 'block';
            } else {
                updateStatus('Es konnten keine Daten aus den PDFs extrahiert werden.', true);
            }

        } catch (error) {
            updateStatus(`Ein globaler Fehler ist aufgetreten: ${error.message}`, true);
        } finally {
            checkCanProcess();
        }
    });

    async function convertPdfToStackedJpg(arrayBuffer, fileName) {
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;
            if (numPages === 0) {
                updateStatus(`PDF ${fileName} hat keine Seiten.`, true);
                return null;
            }

            const pageCanvases = [];
            let totalHeight = 0;
            let maxWidth = 0;

            updateStatus(`Rendere ${numPages} Seiten für ${fileName}...`);
            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
                
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');
                
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                
                pageCanvases.push(canvas);
                totalHeight += canvas.height;
                maxWidth = Math.max(maxWidth, canvas.width);
                updateStatus(`Seite ${i}/${numPages} von ${fileName} gerendert.`);
            }

            if (pageCanvases.length === 0) {
                updateStatus(`Keine Seiten konnten für ${fileName} gerendert werden.`, true);
                return null;
            }

            updateStatus(`Erstelle kombiniertes Bild für ${fileName}...`);
            const mainCanvas = document.createElement('canvas');
            mainCanvas.width = maxWidth;
            mainCanvas.height = totalHeight;
            const mainContext = mainCanvas.getContext('2d');
            mainContext.fillStyle = '#FFFFFF';
            mainContext.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

            let currentY = 0;
            for (const pageCanvas of pageCanvases) {
                mainContext.drawImage(pageCanvas, 0, currentY);
                currentY += pageCanvas.height;
            }
            
            const dataUrl = mainCanvas.toDataURL('image/jpeg', JPG_QUALITY);
            return dataUrl.split(',')[1];
        } catch (error) {
            updateStatus(`Fehler beim Konvertieren von PDF zu JPG für ${fileName}: ${error.message}`, true);
            console.error(`PDF to JPG conversion error for ${fileName}:`, error);
            return null;
        }
    }

    async function callGoogleGemini(base64ImageData, apiKey, fileName) {
        // --- MODEL SELECTION ---
        // Using the specific preview model as requested.
        const modelName = "gemini-2.5-flash-preview-05-20"; // << UPDATED MODEL ID

        updateStatus(`Verwende Google Gemini Modell: ${modelName} für ${fileName}`);

        // The endpoint uses the modelName directly.
        const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const prompt = `
Analyze the following image which contains one or more pages of a German painting business invoice, stacked vertically.
Extract the following information from this invoice image.
Provide the output strictly as a JSON object. Do NOT include any explanatory text before or after the JSON.

The JSON should have these top-level fields:
- "invoice_date": Invoice date (format as YYYY-MM-DD, infer year if missing based on common sense for recent invoices). This is the main date of the invoice document.
- "supplier": The name of the company that *issued* this invoice (the sender/vendor). CRITICAL: "Steinbrink GmbH" is the company receiving these invoices and MUST NOT be identified as the supplier. The supplier is the company whose name and contact details typically appear at the top of the invoice as the sender.
- "items": An array of objects, where each object represents a line item and has:
    - "product": Product or service description (e.g., "Maler-Abdeckvlies", "Dispersionsfarbe weiß").
    - "unit": Unit of measure (e.g., "Stück", "Liter", "m²", "Std.", "Pauschale").
    - "amount": Amount of units (quantity, as a number).
    - "price_per_unit_euro": Price per unit in Euro (as a number, before any item-specific discount). If this item represents a credit or "Gutschrift", this value should be NEGATIVE.
    - "item_discount_amount_pct": The percentage discount applied *specifically to this line item* (e.g., 10 for 10%, 5 for 5%). If no discount for this item, use 0 or null. Do not include the % symbol.
    - "item_total_cost_euro": The total cost for this line item in Euro, extracted *directly from the invoice text* (often labeled as "Gesamtpreis", "Betrag", or similar for the line item total). If this item represents a credit or "Gutschrift", this value should be NEGATIVE.
    - "delivery_date": Delivery or service date for this specific item (German: "Leistungsdatum", "Lieferdatum") in format YYYY-MM-DD. This date might be listed per item, in a column, or apply to a group of items. If a general delivery date is mentioned for the whole invoice and no item-specific date is found, use that. Infer year if missing based on common sense for recent invoices. Use null if not found.
    - "construction_site": The construction site, project reference, or customer reference associated with this specific item. This might be labeled as "Referenz", "Bauvorhaben", "Objekt", "BV", or be a person's name or project name. Often, a construction site is mentioned as a heading or note *before* a group of items it applies to. Assign this to subsequent items in that group until a new site is specified. IMPORTANT: The construction site should be a specific project location or identifier. It MUST NOT be the general address of the invoice recipient (e.g., do NOT use "Orketalstraße 26" if that is the recipient's address) and it MUST NOT be the recipient's company name (e.g., do NOT use "Steinbrink GmbH"). If no specific site is found for an item, use null.

Example of a single item in the "items" array:
{
  "product": "Latexfarbe Seidenglanz",
  "unit": "Liter",
  "amount": 10,
  "price_per_unit_euro": 8.50,
  "item_discount_amount_pct": 5,
  "item_total_cost_euro": 80.75,
  "delivery_date": "2023-10-15",
  "construction_site": "Neubau Müller, EG"
}

If a field cannot be found or is not applicable, use null for string/date fields and 0 or null for numeric fields (like item_discount_amount_pct) where appropriate within the JSON structure.
For "items", if no line items are clearly discernible, provide an empty array for "items" and fill other fields if possible.
The invoice is for the file named "${fileName}".

JSON Output:
`;
        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64ImageData
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                response_mime_type: "application/json",
                temperature: 0.0,
            }
        };

        try {
            const response = await fetch(GEMINI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            if (!response.ok) {
                const errorMessage = responseData.error?.message || `Google API HTTP error! Status: ${response.status}`;
                let detailedError = errorMessage;
                if (responseData.error && responseData.error.details) {
                    detailedError += ` Details: ${JSON.stringify(responseData.error.details)}`;
                }
                throw new Error(`[${fileName}] ${detailedError}`);
            }
            
            if (responseData.promptFeedback && responseData.promptFeedback.blockReason) {
                 throw new Error(`[${fileName}] Google API request blocked. Reason: ${responseData.promptFeedback.blockReason}. Safety Ratings: ${JSON.stringify(responseData.promptFeedback.safetyRatings)}`);
            }

            const candidate = responseData.candidates && responseData.candidates[0];
            const contentPart = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];

            if (!contentPart || typeof contentPart.text === 'undefined') {
                console.error("Unexpected Gemini API response structure for " + fileName + ":", JSON.stringify(responseData, null, 2));
                let problem = "unexpected structure or no text content";
                if (candidate && candidate.finishReason && candidate.finishReason !== "STOP") {
                    problem = `finishReason: ${candidate.finishReason}`;
                }
                throw new Error(`[${fileName}] Google Gemini API-Antwort hatte ${problem}.`);
            }
            
            const contentText = contentPart.text;
            let parsedContent;
            try {
                parsedContent = JSON.parse(contentText);
            } catch (e) {
                updateStatus(`Gemini-Antwort für ${fileName} war kein direktes JSON, versuche Extraktion. Inhalt: ${contentText.substring(0, 200)}...`, true);
                const jsonMatch = contentText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[1] || jsonMatch[2];
                    try {
                        parsedContent = JSON.parse(jsonString);
                    } catch (e2) {
                        throw new Error(`[${fileName}] Konnte JSON aus Gemini-Antwort auch nach Regex-Extraktion nicht parsen: ${e2.message}. Extrahierter String: ${jsonString.substring(0,200)}... Rohinhalt: ${contentText.substring(0,200)}...`);
                    }
                } else {
                    throw new Error(`[${fileName}] Konnte JSON aus Gemini-Antwort nicht parsen und kein JSON-Block gefunden: ${e.message}. Rohinhalt: ${contentText.substring(0,200)}...`);
                }
            }

            if (parsedContent && typeof parsedContent === 'object' && !Array.isArray(parsedContent.items)) {
                parsedContent.items = [];
            }
            return parsedContent;

        } catch (error) {
            updateStatus(`Google Gemini API-Aufruf für ${fileName} fehlgeschlagen: ${error.message}`, true);
            console.error(`Google Gemini API Error for ${fileName}:`, error);
            return null;
        }
    }

    downloadButton.addEventListener('click', () => {
        if (extractedDataFromPdfs.length === 0) {
            updateStatus('Keine Daten zum Herunterladen vorhanden.', true);
            return;
        }

        const worksheetData = [];
        worksheetData.push([
            "Dateiname", "Rechnungsdatum", "Lieferant",
            "Produkt", "Einheit", "Menge", "Preis/Einheit (€)",
            "Artikelrabatt (%)", "Gesamtkosten Artikel (€)",
            "Liefer-/Leistungsdatum (Artikel)", "Bauvorhaben/Referenz (Artikel)"
        ]);

        const getNum = (val) => {
            if (val === null || typeof val === 'undefined') return '';
            const strVal = String(val).replace(',', '.');
            const num = parseFloat(strVal);
            return isNaN(num) ? '' : num;
        };
        const getStr = (val) => (val === null || typeof val === 'undefined') ? '' : String(val);

        extractedDataFromPdfs.forEach(invoice => {
            if (invoice.items && invoice.items.length > 0) {
                invoice.items.forEach(item => {
                    worksheetData.push([
                        getStr(invoice.fileName),
                        getStr(invoice.invoice_date),
                        getStr(invoice.supplier),
                        getStr(item.product),
                        getStr(item.unit),
                        getNum(item.amount),
                        getNum(item.price_per_unit_euro),
                        getNum(item.item_discount_amount_pct),
                        getNum(item.item_total_cost_euro),
                        getStr(item.delivery_date),
                        getStr(item.construction_site)
                    ]);
                });
            } else {
                worksheetData.push([
                    getStr(invoice.fileName),
                    getStr(invoice.invoice_date),
                    getStr(invoice.supplier),
                    'N/A', 'N/A', '', '',
                    '', '', 'N/A', 'N/A'
                ]);
            }
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        const columnWidths = [
            { wch: 25 }, { wch: 12 }, { wch: 30 }, { wch: 35 }, { wch: 10 },
            { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 30 }
        ];
        worksheet['!cols'] = columnWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, "Rechnungen");
        XLSX.writeFile(workbook, "extrahierte_rechnungsdaten.xlsx");
        updateStatus('Excel-Datei heruntergeladen.');
    });
});