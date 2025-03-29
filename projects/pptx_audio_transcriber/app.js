// Natural sort function for sorting filenames with numbers
function naturalSort(a, b) {
    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    return collator.compare(a, b);
}

// Function to transcribe audio using OpenAI Whisper API
async function transcribeAudio(audioBlob, apiKey) {
    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.mp3');
        formData.append('model', 'whisper-1');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        return data.text;
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}

// Function to extract audio files from a PowerPoint file
async function extractAudioFiles(file) {
    try {
        // Read the file as an ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Load the file into JSZip
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // Array to store audio file data
        const audioFiles = [];
        
        // Look for audio files in the ppt/media directory
        const promises = [];
        
        zip.forEach((relativePath, zipEntry) => {
            // Check if the file is in the media directory and is an audio file
            if (relativePath.startsWith('ppt/media/') && 
                (relativePath.endsWith('.mp3') || 
                 relativePath.endsWith('.wav') || 
                 relativePath.endsWith('.m4a') || 
                 relativePath.endsWith('.wma'))) {
                // Extract just the filename
                const fileName = relativePath.split('/').pop();
                
                // Get the file content as blob
                const promise = zipEntry.async('blob').then(blob => {
                    audioFiles.push({
                        name: fileName,
                        blob: blob
                    });
                });
                
                promises.push(promise);
            }
        });
        
        // Wait for all promises to resolve
        await Promise.all(promises);
        
        // Sort the audio files using natural sort based on name
        audioFiles.sort((a, b) => naturalSort(a.name, b.name));
        
        return audioFiles;
    } catch (error) {
        console.error('Error extracting audio files:', error);
        return [];
    }
}

// Function to create a transcription container
function createTranscriptionContainer() {
    // Check if container already exists
    let container = document.getElementById('transcriptionContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'transcriptionContainer';
        container.className = 'transcription-container';
        
        // Find the section that should contain the transcriptions
        const transcriptionSection = document.querySelector('section:nth-of-type(3)');
        const exportButton = document.getElementById('exportTxt');
        
        // Insert the container before the export button
        transcriptionSection.insertBefore(container, exportButton);
    }
    
    return container;
}

// Function to add a transcription to the container
function addTranscription(slideNumber, text) {
    const container = createTranscriptionContainer();
    
    const transcriptionDiv = document.createElement('div');
    transcriptionDiv.className = 'transcription-item';
    
    const slideHeader = document.createElement('h3');
    slideHeader.textContent = `Slide ${slideNumber}`;
    
    const transcriptionText = document.createElement('p');
    transcriptionText.textContent = text;
    
    transcriptionDiv.appendChild(slideHeader);
    transcriptionDiv.appendChild(transcriptionText);
    container.appendChild(transcriptionDiv);
    
    return transcriptionDiv;
}

// Function to clear all transcriptions
function clearTranscriptions() {
    const container = document.getElementById('transcriptionContainer');
    if (container) {
        container.innerHTML = '';
    }
}

// Function to export transcriptions as TXT
function exportTranscriptionsAsTxt() {
    const container = document.getElementById('transcriptionContainer');
    if (!container || container.children.length === 0) {
        alert('No transcriptions to export.');
        return;
    }
    
    let textContent = '';
    
    // Loop through all transcription items
    Array.from(container.children).forEach(item => {
        const slideHeader = item.querySelector('h3').textContent;
        const transcriptionText = item.querySelector('p').textContent;
        
        textContent += `${slideHeader}\n${transcriptionText}\n\n`;
    });
    
    // Create a blob with the text content
    const blob = new Blob([textContent], { type: 'text/plain' });
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.txt';
    
    // Trigger the download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Function to display the selected filename
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const startProcessingBtn = document.getElementById('startProcessingBtn');
    const exportTxtBtn = document.getElementById('exportTxt');
    
    fileInput.addEventListener('change', function() {
        if (fileInput.files.length > 0) {
            // Get the file name
            const fileName = fileInput.files[0].name;
            // Update the file info text
            fileInfo.textContent = `Selected file: ${fileName}`;
            // Optional: Add a class to style the text differently when a file is selected
            fileInfo.classList.add('file-selected');
        } else {
            // Reset to default if no file is selected
            fileInfo.textContent = 'No file selected';
            // Remove the class if it was added
            fileInfo.classList.remove('file-selected');
        }
    });

    // Add event listener for the Export as TXT button
    exportTxtBtn.addEventListener('click', exportTranscriptionsAsTxt);

    // Add event listener for the Start Transcribing button
    startProcessingBtn.addEventListener('click', async function() {
        const openAIapiKey = document.getElementById('openAIapiKey').value;
        
        // Check if a file has been uploaded
        if (fileInput.files.length === 0) {
            console.log("No file selected");
            alert("Please select a PowerPoint file before starting the transcription.");
            return;
        }
        
        // Check if OpenAI API key is set
        if (openAIapiKey && openAIapiKey.trim() !== '') {
            console.log("start processing");
            
            // Clear previous transcriptions
            clearTranscriptions();
            
            // Show loading indicator
            startProcessingBtn.textContent = 'Transcribing...';
            startProcessingBtn.disabled = true;
            
            try {
                // Extract audio files from the PowerPoint
                const file = fileInput.files[0];
                const audioFiles = await extractAudioFiles(file);
                
                // Get the number of slides to process
                const nrSlides = parseInt(document.getElementById('nrSlides').value, 10);
                
                // Filter audio files based on nrSlides value
                let selectedAudioFiles = audioFiles;
                if (nrSlides > 0) {
                    // If nrSlides is greater than 0, select only that many files (or all if fewer are available)
                    selectedAudioFiles = audioFiles.slice(0, nrSlides);
                } else {
                    selectedAudioFiles = audioFiles;
                }
                
                console.log(`Selected ${selectedAudioFiles.length} audio files for transcription`);
                
                // Process each audio file for transcription
                for (let i = 0; i < selectedAudioFiles.length; i++) {
                    const audioFile = selectedAudioFiles[i];
                    const slideNumber = i + 1;
                    
                    // Update button text to show progress
                    startProcessingBtn.textContent = `Transcribing slide ${slideNumber}/${selectedAudioFiles.length}...`;
                    
                    try {
                        // Transcribe the audio file
                        const transcription = await transcribeAudio(audioFile.blob, openAIapiKey);
                        
                        // Add the transcription to the UI
                        addTranscription(slideNumber, transcription);
                        
                        console.log(`Transcribed slide ${slideNumber}: ${transcription.substring(0, 50)}...`);
                    } catch (error) {
                        console.error(`Error transcribing slide ${slideNumber}:`, error);
                        addTranscription(slideNumber, `Error: ${error.message}`);
                    }
                }
                
                console.log("Transcription complete");
            } catch (error) {
                console.error("Error during transcription process:", error);
                alert(`Error during transcription: ${error.message}`);
            } finally {
                // Reset button state
                startProcessingBtn.textContent = 'Start Transcribing';
                startProcessingBtn.disabled = false;
            }
        } else {
            console.log("OpenAI API key is not set");
            alert("Please enter your OpenAI API key before starting the transcription.");
        }
    });
});
