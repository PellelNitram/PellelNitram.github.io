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
        statusMessages.textContent += (isError ? `FEHLER: ${message}\n` : `${message}\n`); // Translated "ERROR"
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
            updateStatus(`Ausgewählte ZIP-Datei: ${currentZipFile.name}`); // Translated
        } else {
            updateStatus('ZIP-Datei abgewählt.'); // Translated
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
            updateStatus('Bitte wählen Sie eine ZIP-Datei aus und geben Sie Ihren API-Schlüssel ein.', true); // Translated
            return;
        }

        processButton.disabled = true;
        downloadButton.style.display = 'none';
        extractedDataFromPdfs = [];
        statusMessages.textContent = '';
        updateStatus('Verarbeitung gestartet...'); // Translated

        try {
            const zip = await JSZip.loadAsync(currentZipFile);
            const pdfFiles = [];
            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.pdf')) {
                    pdfFiles.push(zipEntry);
                }
            });

            if (pdfFiles.length === 0) {
                updateStatus('Keine PDF-Dateien in der ZIP-Datei gefunden.', true); // Translated
                processButton.disabled = false;
                return;
            }

            updateStatus(`${pdfFiles.length} PDF-Datei(en) gefunden. Text wird extrahiert...`); // Translated

            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                updateStatus(`Verarbeite ${pdfFile.name} (${i + 1}/${pdfFiles.length})...`); // Translated
                try {
                    const arrayBuffer = await pdfFile.async('arraybuffer');
                    const pdfText = await extractTextFromPdf(arrayBuffer);
                    if (pdfText.trim() === '') {
                        updateStatus(`Kein Text aus ${pdfFile.name} extrahiert. Wird übersprungen.`, true); // Translated
                        continue;
                    }
                    updateStatus(`Text aus ${pdfFile.name} extrahiert. Sende an OpenAI...`); // Translated
                    const extractedInfo = await callOpenAI(pdfText, currentApiKey, pdfFile.name);
                    if (extractedInfo) {
                        extractedDataFromPdfs.push({ fileName: pdfFile.name, ...extractedInfo });
                        updateStatus(`Daten für ${pdfFile.name} extrahiert.`); // Translated
                    }
                } catch (pdfError) {
                    updateStatus(`Fehler bei der Verarbeitung von ${pdfFile.name}: ${pdfError.message}`, true); // Translated
                }
            }

            if (extractedDataFromPdfs.length > 0) {
                updateStatus('Alle PDFs verarbeitet. Excel-Datei steht zum Download bereit.'); // Translated
                downloadButton.style.display = 'block';
            } else {
                updateStatus('Es konnten keine Daten aus den PDFs extrahiert werden.', true); // Translated
            }

        } catch (error) {
            updateStatus(`Ein Fehler ist aufgetreten: ${error.message}`, true); // Translated
        } finally {
            processButton.disabled = false;
            checkCanProcess();
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
            fullText += '\n';
        }
        return fullText;
    }

    async function callOpenAI(text, apiKey, fileName) {
        // IMPORTANT: The prompt remains in English for best AI performance
        const prompt = `
Extract the following information from this German painting business invoice text.
The invoice text is OCR'd and might contain errors. Try your best to interpret it.
Provide the output strictly as a JSON object. Do NOT include any explanatory text before or after the JSON.
The JSON should have these top-level fields:
- "date": Invoice date (format as YYYY-MM-DD, infer year if missing based on common sense for recent invoices)
- "supplier": Supplier name (the company that issued the invoice)
- "items": An array of objects, where each object represents a line item and has:
    - "product": Product or service description (e.g., "Maler-Abdeckvlies", "Dispersionsfarbe weiß")
    - "unit": Unit of measure (e.g., "Stück", "Liter", "m²", "Std.", "Pauschale")
    - "amount": Amount of units (quantity, as a number)
    - "pricePerUnit": Price per unit (as a number, before any item-specific discount)
    - "itemDiscountAmount": The monetary value of any discount applied *specifically to this line item*. If a percentage discount is given for the item, calculate its monetary value based on (amount * pricePerUnit). If no discount for this item, use 0 or null.
    - "itemTotalCost": The total cost for this line item, calculated as (amount * pricePerUnit) - itemDiscountAmount. Ensure this calculation is performed accurately.

Example of a single item in the "items" array:
{
  "product": "Latexfarbe Seidenglanz",
  "unit": "Liter",
  "amount": 10,
  "pricePerUnit": 8.50,
  "itemDiscountAmount": 5.00, // Example: A 5 EUR discount on these 10 Liters
  "itemTotalCost": 80.00    // (10 * 8.50) - 5.00 = 85.00 - 5.00 = 80.00
}

Another example with percentage discount for an item (hypothetical):
If an item "Pinselset Profi" costs 20 EUR (amount: 1, pricePerUnit: 20) and has a 10% item discount:
{
  "product": "Pinselset Profi",
  "unit": "Stück",
  "amount": 1,
  "pricePerUnit": 20.00,
  "itemDiscountAmount": 2.00,  // 10% of 20.00
  "itemTotalCost": 18.00     // 20.00 - 2.00
}

If a field cannot be found, use null for string/date fields and 0 or null for numeric fields where appropriate within the JSON structure.
For "items", if no line items are clearly discernible, provide an empty array for "items" and fill other fields if possible.
Ensure "itemTotalCost" is correctly calculated based on "amount", "pricePerUnit", and "itemDiscountAmount".

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
                    model: "gpt-4o", // Or "gpt-4-turbo" for potentially better results
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `HTTP error! Status: ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;

            if (!content) {
                throw new Error("OpenAI-Antwort enthielt keinen Inhalt."); // Translated
            }
            
            try {
                return JSON.parse(content);
            } catch (e) {
                updateStatus(`OpenAI-Antwort für ${fileName} war kein sauberes JSON. Versuche zu extrahieren. Inhalt: ${content}`, true); // Translated
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```|({[\s\S]*})/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[1] || jsonMatch[2];
                    return JSON.parse(jsonString);
                }
                throw new Error(`Konnte JSON aus OpenAI-Antwort für ${fileName} nicht parsen: ${e.message}. Rohinhalt: ${content}`); // Translated
            }

        } catch (error) {
            updateStatus(`OpenAI API-Aufruf für ${fileName} fehlgeschlagen: ${error.message}`, true); // Translated
            console.error("OpenAI Error details for " + fileName + ":", error);
            return null;
        }
    }

    downloadButton.addEventListener('click', () => {
        if (extractedDataFromPdfs.length === 0) {
            updateStatus('Keine Daten zum Herunterladen vorhanden.', true); // Translated
            return;
        }

        const worksheetData = [];
        worksheetData.push([
            "Dateiname", "Datum", "Lieferant", // Translated Excel Headers
            "Produkt", "Einheit", "Menge", "Preis pro Einheit",
            "Rabattbetrag (Artikel)", "Gesamtkosten (Artikel)"
        ]);

        extractedDataFromPdfs.forEach(invoice => {
            const getNum = (val) => (val === null || typeof val === 'undefined' || isNaN(parseFloat(val))) ? '' : parseFloat(val);

            if (invoice.items && invoice.items.length > 0) {
                invoice.items.forEach(item => {
                    worksheetData.push([
                        invoice.fileName,
                        invoice.date || '',
                        invoice.supplier || '',
                        item.product || '',
                        item.unit || '',
                        getNum(item.amount),
                        getNum(item.pricePerUnit),
                        getNum(item.itemDiscountAmount),
                        getNum(item.itemTotalCost)
                    ]);
                });
            } else {
                worksheetData.push([
                    invoice.fileName,
                    invoice.date || '',
                    invoice.supplier || '',
                    'N/A', 'N/A', 'N/A', 'N/A',
                    'N/A', 'N/A'
                ]);
            }
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        const columnWidths = [
            { wch: 25 }, // Dateiname
            { wch: 12 }, // Datum
            { wch: 30 }, // Lieferant
            { wch: 35 }, // Produkt
            { wch: 10 }, // Einheit
            { wch: 15 }, // Menge
            { wch: 15 }, // Preis pro Einheit
            { wch: 20 }, // Rabattbetrag (Artikel)
            { wch: 15 }  // Gesamtkosten (Artikel)
        ];
        worksheet['!cols'] = columnWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, "Rechnungen"); // Translated worksheet name
        XLSX.writeFile(workbook, "extrahierte_rechnungsdaten.xlsx"); // Translated filename
        updateStatus('Excel-Datei heruntergeladen.'); // Translated
    });
});