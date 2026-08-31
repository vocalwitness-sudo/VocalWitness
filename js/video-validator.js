// js/video-validator.js - Non-Blocking Inspection & Structural Pre-flight

/**
 * Structural constraints for baseline stream safety
 */
const VIDEO_CONSTRAINTS = {
    MAX_DURATION_SECONDS: 300, // 5 minutes max
    MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB baseline soft limit
    ALLOWED_CONTAINERS: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
};

/**
 * Safe inspection of incoming video files.
 * Validates container health while scanning for C2PA and NLE signatures.
 * Non-destructive: Returns metadata tags for Layer 3 background batch queue.
 * 
 * @param {File} file 
 * @returns {Promise<{
 *   valid: boolean, 
 *   reason?: string,
 *   message?: string,
 *   provenance: string, 
 *   editorDetected: boolean, 
 *   detectedSignatures: string[],
 *   duration?: number
 * }>}
 */
export async function inspectAndValidateVideo(file) {
    if (!file) {
        return { 
            valid: false, 
            reason: "NO_FILE",
            message: "No video file was selected for inspection.",
            provenance: "unverified", 
            editorDetected: false, 
            detectedSignatures: [] 
        };
    }

    // 1. Check Container MIME type
    if (file.type && !VIDEO_CONSTRAINTS.ALLOWED_CONTAINERS.includes(file.type)) {
        return { 
            valid: false, 
            reason: "UNSUPPORTED_FORMAT",
            message: `Unsupported format (${file.type || 'unknown'}). Please upload MP4, WebM, or MOV formats.`,
            provenance: "unverified",
            editorDetected: false,
            detectedSignatures: []
        };
    }

    // 2. Read Header (First 64KB) and Trailer (Last 64KB) for C2PA & NLE Signatures
    let provenanceStatus = "unverified";
    let editorDetected = false;
    const detectedSignatures = [];

    try {
        const chunkSize = 65536; // 64KB
        const headerSlice = await file.slice(0, chunkSize).arrayBuffer();
        
        // MP4 moov atoms and metadata are often stored at the tail of the file
        const trailerSlice = file.size > chunkSize 
            ? await file.slice(Math.max(0, file.size - chunkSize), file.size).arrayBuffer() 
            : new ArrayBuffer(0);

        const decoder = new TextDecoder("ascii", { fatal: false });
        const headerText = decoder.decode(headerSlice) + decoder.decode(trailerSlice);

        // Scan C2PA / Content Credentials markers
        const c2paKeywords = ["trainedAlgorithmicMedia", "c2pa.assertions", "c2pa.actions", "c2pa", "jumb", "c2ma"];
        const hasC2PA = c2paKeywords.some(kw => headerText.includes(kw));
        
        if (hasC2PA) {
            provenanceStatus = "c2pa_sealed";
            detectedSignatures.push("C2PA_MANIFEST");
        }

        // Scan for Post-Production / NLE Software Signatures
        const editorKeywords = ["CapCut", "Premiere", "Final Cut", "DaVinci", "HandBrake", "After Effects", "InShot", "RunwayML", "Sora", "Pika", "Kling"];
        editorKeywords.forEach(kw => {
            if (headerText.includes(kw)) {
                editorDetected = true;
                if (!detectedSignatures.includes(kw)) {
                    detectedSignatures.push(kw);
                }
            }
        });

    } catch (err) {
        console.warn("Video header/trailer inspection warning (bypassed safely):", err);
    }

    // 3. Inspect Stream Metadata (Duration check)
    return new Promise((resolve) => {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';

        const objectUrl = URL.createObjectURL(file);
        videoElement.src = objectUrl;

        let resolved = false;

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                URL.revokeObjectURL(objectUrl);
                videoElement.removeAttribute('src');
                videoElement.load();
            }
        };

        // Safety fallback timer for corrupt video streams
        const timeoutId = setTimeout(() => {
            cleanup();
            resolve({
                valid: true,
                provenance: provenanceStatus,
                editorDetected,
                detectedSignatures
            });
        }, 5000);

        videoElement.onloadedmetadata = () => {
            clearTimeout(timeoutId);
            const duration = videoElement.duration;
            cleanup();

            if (duration > VIDEO_CONSTRAINTS.MAX_DURATION_SECONDS) {
                return resolve({
                    valid: false,
                    reason: "DURATION_EXCEEDED",
                    message: `Video exceeds maximum length of 5 minutes (current: ${Math.round(duration)}s).`,
                    provenance: provenanceStatus,
                    editorDetected,
                    detectedSignatures
                });
            }

            resolve({
                valid: true,
                provenance: provenanceStatus,
                editorDetected,
                detectedSignatures,
                duration: Math.round(duration)
            });
        };

        videoElement.onerror = () => {
            clearTimeout(timeoutId);
            cleanup();
            // Non-blocking fallback: pass stream but flag for server check
            resolve({
                valid: true,
                provenance: provenanceStatus,
                editorDetected,
                detectedSignatures
            });
        };
    });
}

/**
 * Primary interface for composer modules.
 * Alias wrapper around inspectAndValidateVideo.
 * 
 * @param {File} file 
 * @returns {Promise<Object>}
 */
export async function validateVideoFile(file) {
    return await inspectAndValidateVideo(file);
}
