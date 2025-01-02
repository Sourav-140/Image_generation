export const createPrompt = (name, month, theme) => {
    return `Artistic Nature Photography: ${theme}  

        Landscape Composition:
        - Capture a breathtaking, immersive scene that embodies the ${month} & ${theme}
        - Create a dynamic, high-detail landscape with vivid, natural colors
        - Integrate the name ${name} organically into the scene

        Text Integration Guidelines:
        - Text should not appear artificial or digitally overlaid
        - Text should be written in uppercase letters
        - Letters must emerge naturally from landscape elements of ${theme}
        - Text should be an artistic focal point that harmonizes with the scene


        Technical Specifications:
        - Ultra-high resolution
        - Hyper-realistic details
        - Natural lighting
        - Cinematic composition
        - Color palette true to the seasonal theme
        - Sharp focus on landscape and textual elements
        - Minimal post-processing
        - Authentic, unmanipulated appearance

        Photography Style:
        - Nature photography
        - Landscape cinematography
        - Organic, seamless integration
        - Artistic interpretation of natural scenery

        Mood and Atmosphere:
        - Capture the essence of ${month}'s unique ${theme}
        - Evoke emotional connection with the landscape
        - Create a sense of wonder and artistic discovery

        Avoid:
        - Digital text overlays
        - Artificial text placements
        - Forced or unnatural letter formations
        - Repeated text, merging text and missing text
        - Disconnected text elements or space between text`;
};