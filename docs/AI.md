# AI (optional)

Off by default; everything else works without it. Settings, AI is one list of the AIs you have set up. Add as many as you like, open one to change it, and choose which one is in use:

- **On your network** (photos never leave it): [Ollama](https://ollama.com) (a vision model such as `llava` and an embedding model such as `nomic-embed-text`), or any local OpenAI-compatible server (LM Studio, llama.cpp, vLLM, LocalAI).
- **Cloud**: Claude, Gemini, ChatGPT, OpenRouter, or any other OpenAI-compatible service. Previews (at most 1024 px) are sent to that third party, so you must tick a confirmation on each one before it can be used.
- Claude and OpenRouter have no embeddings, so with one of those in use, search by meaning is unavailable (colour and shape still drive similar photos).
- API keys are write-only: never shown again and left out of backups. Testing a connection sends one short text message, never a photograph.
- Removing the confirmation, or deleting the AI in use, switches AI off rather than sending photos anywhere unconfirmed.
- **Members' own AIs must be on the public internet.** A member who adds their own AI (when the administrator allows it) must use a public internet address. Localhost, private network ranges, cloud metadata addresses and single-word or .local names are refused when saving. An administrator can still add a local AI (Ollama, LM Studio) and share it with everyone.

It suggests descriptions, subjects and tags (nothing counts until you accept it), enables search by meaning and natural-language searches, and improves "similar" suggestions. Without AI, colour, shape and light still drive similarity, near-duplicate detection and recommendations.

## Automatic analysis

Under **Settings → Your library → AI**, **Automatically analyse new photos** controls background photo analysis after imports, on startup and when settings trigger pending work. It defaults to on, preserving existing behaviour when a provider is configured. Turn it off to import and organise without automatically sending previews to AI. Search and other explicitly requested AI actions remain available.

Turning it off lets the current photo finish, then stops the automatic queue. **Analyze with AI** and manual batch analysis still work while it is off. Turning it back on processes waiting photos, including ones imported while disabled. The setting is saved separately for each person.

## Header activity indicator

The **✦** beside the theme toggle pulses amber while AI is working, and returns to muted grey when idle. Hover or focus it for the current task. Background photo batches show processed/total progress and any failed count; a single-photo analysis, search or composition-idea request shows its task without a misleading batch percentage. Activity belongs to the signed-in person’s library. Status refreshes approximately every two seconds while the tab is visible; a short request can finish between refreshes.

If status cannot be loaded, the indicator reads **AI status unavailable** rather than continuing to claim work is active. Reduced-motion preferences disable pulsing.

## Provider colours

Each AI provider can have a separate colour. Open its configuration in Settings → AI, choose **Provider colour**, select one of eight muted swatches, and **Save changes**. The default grey swatch retains neutral styling.

While a generated tag or subject awaits a decision, its chip is tinted with the colour of the AI that proposed it. Accepting or rejecting the suggestion clears the stored attribution. An AI description awaiting approval shows a tinted card with the provider name, **Use suggestion**, and **Dismiss**. Accepted descriptions and tags use Frames’ regular styling.

Generated Light and Mood hints use the provider tint when their analysis has source information. The header's ✦ working icon and progress indicator use the colour of the provider processing the current task, including between photos in a batch. When multiple providers work simultaneously, the header uses the first reported provider. Colours are visual hints, not the only indication of provenance; AI suggestions still include ✦ and readable labels.

Old suggestions created before this feature do not have a recorded provider. They remain neutral instead of being attributed to the current AI. Deleting a provider also leaves its outstanding suggestions neutral. Shared providers are configured by the administrator, including their colour, and are read-only for members. The palette is intentionally restricted to the built-in swatches to maintain consistent colour presentation.
