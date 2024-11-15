export function isUnsupportedBrowser() {
    // Check for mobile/tablet
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    )

    // Check for unsupported browsers
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

    // Check for required features
    const hasWebGL2 = !!document.createElement('canvas').getContext('webgl2')
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined'

    return {
        isUnsupported: isMobile || isFirefox || isSafari || !hasWebGL2 || !hasSharedArrayBuffer,
        reasons: {
            isMobile,
            isFirefox,
            isSafari,
            noWebGL2: !hasWebGL2,
            noSharedArrayBuffer: !hasSharedArrayBuffer
        }
    }
} 