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
            provenance: "unverified",
            editorDetected: false,
            detectedSignatures: []
        };
    }

    // 2. Read first 64KB chunk for header inspection (C2PA & NLE Signatures)
    let provenanceStatus = "unverified";
    let editorDetected = false;
    const detectedSignatures = [];

    try {
        const headerSlice = await file.slice(0, 65536).arrayBuffer();
        const decoder = new TextDecoder("ascii", { fatal: false });
        const headerText = decoder.decode(headerSlice);

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
                detectedSignatures.push(kw);
            }
        });

    } catch (err) {
        console.warn("Video header inspection warning (bypassed safely):", err);
    }

    // 3. Inspect Stream Metadata (Duration check)
    return new Promise((resolve) => {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';

        const objectUrl = URL.createObjectURL(file);
        videoElement.src = objectUrl;

        videoElement.onloadedmetadata = () => {
            URL.revokeObjectURL(objectUrl);

            const duration = videoElement.duration;
            if (duration > VIDEO_CONSTRAINTS.MAX_DURATION_SECONDS) {
                return resolve({
                    valid: false,
                    reason: "DURATION_EXCEEDED",
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
            URL.revokeObjectURL(objectUrl);
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
