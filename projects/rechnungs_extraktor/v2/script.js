document.addEventListener('DOMContentLoaded', () => {
    const zipFileInput = document.getElementById('zipFile');
    const apiKeyInput = document.getElementById('apiKey');
    const processButton = document.getElementById('processButton');
    const downloadButton = document.getElementById('downloadButton');
    const statusMessages = document.getElementById('statusMessages');

    let extractedDataFromPdfs = [];
    let currentZipFile = null;
    let currentApiKey = '';

    function updateStatus(message, isError = false) {
        const Sentry = window.Sentry;
        if (isError && Sentry) {
            Sentry.captureMessage(message);
        }
        statusMessages.textContent += (isError ? `FEHLER: ${message}\n` : `${message}\n`);
        statusMessages.scrollTop = statusMessages.scrollHeight;
    }

    function checkCanProcess() {
        if (currentZipFile && currentApiKey && currentApiKey.startsWith('sk-')) {
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
            updateStatus('Bitte wählen Sie eine ZIP-Datei aus und geben Sie Ihren API-Schlüssel ein.', true);
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
                processButton.disabled = false;
                return;
            }

            updateStatus(`${pdfFiles.length} PDF-Datei(en) gefunden. Text wird extrahiert...`);

            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                updateStatus(`Verarbeite ${pdfFile.name} (${i + 1}/${pdfFiles.length})...`);
                try {
                    const arrayBuffer = await pdfFile.async('arraybuffer');
                    const pdfText = await extractTextFromPdf(arrayBuffer);
                    if (pdfText.trim() === '') {
                        updateStatus(`Kein Text aus ${pdfFile.name} extrahiert. Wird übersprungen.`, true);
                        continue;
                    }
                    updateStatus(`Text aus ${pdfFile.name} extrahiert. Sende an OpenAI...`);
                    
                    // Call OpenAI with the new prompt and structure
                    const extractedInfo = await callOpenAI(pdfText, currentApiKey, pdfFile.name);
                    
                    if (extractedInfo) {
                        // extractedInfo will be { invoice_date: "...", supplier: "...", items: [...] }
                        extractedDataFromPdfs.push({ fileName: pdfFile.name, ...extractedInfo });
                        updateStatus(`Daten für ${pdfFile.name} extrahiert.`);
                    }
                    
                    // Add 2-second delay between API calls (except for the last file)
                    if (i < pdfFiles.length - 1) {
                        updateStatus('Warte 2 Sekunden vor dem nächsten API-Aufruf...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (pdfError) {
                    updateStatus(`Fehler bei der Verarbeitung von ${pdfFile.name}: ${pdfError.message}`, true);
                }
            }

            if (extractedDataFromPdfs.length > 0) {
                updateStatus('Alle PDFs verarbeitet. Excel-Datei steht zum Download bereit.');
                downloadButton.style.display = 'block';
            } else {
                updateStatus('Es konnten keine Daten aus den PDFs extrahiert werden.', true);
            }

        } catch (error) {
            updateStatus(`Ein Fehler ist aufgetreten: ${error.message}`, true);
        } finally {
            processButton.disabled = false; // Re-enable button
            checkCanProcess(); // Check if it should be re-enabled based on inputs
        }
    });

    async function extractTextFromPdf(arrayBuffer) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textContent.items.forEach(item => {
                fullText += item.str + ' ';
            });
            fullText += '\n'; // Add newline after each page for better readability by LLM
        }
        return fullText;
    }

    async function callOpenAI(text, apiKey, fileName) {
        // Adapted prompt from your Python script
        // Added "invoice_date" to the top-level fields for general invoice date.
        const prompt = `
Extract the following information from this German painting business invoice text.
The invoice text is OCR'd and might contain errors. Try your best to interpret it.
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

Example of a credit item ("Gutschrift"):
{
  "product": "Gutschrift Materialrückgabe",
  "unit": "Pauschale",
  "amount": 1,
  "price_per_unit_euro": -50.00,
  "item_discount_amount_pct": 0,
  "item_total_cost_euro": -50.00,
  "delivery_date": "2023-11-01",
  "construction_site": "Retoure Baustelle Meier"
}

If a field cannot be found or is not applicable, use null for string/date fields and 0 or null for numeric fields (like item_discount_amount_pct) where appropriate within the JSON structure.
For "items", if no line items are clearly discernible, provide an empty array for "items" and fill other fields if possible.
The field "fileName" (which is the name of the PDF being processed) will be added programmatically by the calling code and does not need to be extracted by the model.

Invoice Text for file "${fileName}":
---
${text}
---
JSON Output:
`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o", // Using gpt-4o as in your Python
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.0, // Matching Python temperature for determinism
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // Try to get JSON error, fallback to empty object
                const errorMessage = errorData.error?.message || `HTTP error! Status: ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;

            if (!content) {
                throw new Error("OpenAI-Antwort enthielt keinen Inhalt.");
            }
            
            let parsedContent;
            try {
                parsedContent = JSON.parse(content);
            } catch (e) {
                updateStatus(`OpenAI-Antwort für ${fileName} war kein sauberes JSON. Versuche zu extrahieren. Inhalt: ${content}`, true);
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```|({[\s\S]*})/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[1] || jsonMatch[2]; // Get the first non-null capturing group
                    try {
                        parsedContent = JSON.parse(jsonString);
                    } catch (e2) {
                         throw new Error(`Konnte JSON aus OpenAI-Antwort für ${fileName} auch nach Regex-Extraktion nicht parsen: ${e2.message}. Extrahierter String: ${jsonString}. Rohinhalt: ${content}`);
                    }
                } else {
                    throw new Error(`Konnte JSON aus OpenAI-Antwort für ${fileName} nicht parsen: ${e.message}. Rohinhalt: ${content}`);
                }
            }

            // Ensure 'items' key exists, even if LLM omits it for empty lists
            if (parsedContent && typeof parsedContent === 'object' && !Array.isArray(parsedContent.items)) {
                parsedContent.items = [];
            }
            return parsedContent;

        } catch (error) {
            updateStatus(`OpenAI API-Aufruf für ${fileName} fehlgeschlagen: ${error.message}`, true);
            console.error("OpenAI Error details for " + fileName + ":", error);
            return null; // Return null to indicate failure for this specific file
        }
    }

    downloadButton.addEventListener('click', () => {
        if (extractedDataFromPdfs.length === 0) {
            updateStatus('Keine Daten zum Herunterladen vorhanden.', true);
            return;
        }

        const worksheetData = [];
        // Updated Excel Headers (in German)
        worksheetData.push([
            "Dateiname", "Rechnungsdatum", "Lieferant",
            "Produkt", "Einheit", "Menge", "Preis/Einheit (€)",
            "Artikelrabatt (%)", "Gesamtkosten Artikel (€)",
            "Liefer-/Leistungsdatum (Artikel)", "Bauvorhaben/Referenz (Artikel)"
        ]);

        const getNum = (val) => (val === null || typeof val === 'undefined' || isNaN(parseFloat(val))) ? '' : parseFloat(val);
        const getStr = (val) => (val === null || typeof val === 'undefined') ? '' : String(val);


        extractedDataFromPdfs.forEach(invoice => {
            // invoice structure: { fileName, invoice_date, supplier, items: [...] }
            if (invoice.items && invoice.items.length > 0) {
                invoice.items.forEach(item => {
                    // item structure: { product, unit, amount, price_per_unit_euro, item_discount_amount_pct, item_total_cost_euro, delivery_date, construction_site }
                    worksheetData.push([
                        getStr(invoice.fileName),
                        getStr(invoice.invoice_date), // Top-level invoice date
                        getStr(invoice.supplier),     // Top-level supplier

                        getStr(item.product),
                        getStr(item.unit),
                        getNum(item.amount),
                        getNum(item.price_per_unit_euro),
                        getNum(item.item_discount_amount_pct), // This is a percentage
                        getNum(item.item_total_cost_euro),
                        getStr(item.delivery_date),            // Item-specific
                        getStr(item.construction_site)         // Item-specific
                    ]);
                });
            } else {
                // Handle cases where an invoice might have a supplier/date but no discernible items
                worksheetData.push([
                    getStr(invoice.fileName),
                    getStr(invoice.invoice_date),
                    getStr(invoice.supplier),
                    'N/A', 'N/A', 'N/A', 'N/A', // product, unit, amount, price_per_unit_euro
                    'N/A', 'N/A', 'N/A', 'N/A'  // item_discount_amount_pct, item_total_cost_euro, delivery_date, construction_site
                ]);
            }
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        // Adjusted column widths for the new set of columns
        const columnWidths = [
            { wch: 25 }, // Dateiname
            { wch: 12 }, // Rechnungsdatum
            { wch: 30 }, // Lieferant
            { wch: 35 }, // Produkt
            { wch: 10 }, // Einheit
            { wch: 10 }, // Menge
            { wch: 15 }, // Preis/Einheit (€)
            { wch: 15 }, // Artikelrabatt (%)
            { wch: 20 }, // Gesamtkosten Artikel (€)
            { wch: 20 }, // Liefer-/Leistungsdatum (Artikel)
            { wch: 30 }  // Bauvorhaben/Referenz (Artikel)
        ];
        worksheet['!cols'] = columnWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, "Rechnungen");
        XLSX.writeFile(workbook, "extrahierte_rechnungsdaten.xlsx");
        updateStatus('Excel-Datei heruntergeladen.');
    });
});
