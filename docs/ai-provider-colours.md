# AI provider colours — wiki documentation draft

Publish this under Settings → AI in the user guide when wiki updates are available.

Each AI provider can have a separate colour. Open its configuration in Settings → AI, choose **Provider colour**, select one of eight muted swatches, and **Save changes**. The default grey swatch retains neutral styling.

While a generated tag or subject awaits a decision, its chip is tinted with the colour of the AI that proposed it. Accepting or rejecting the suggestion clears the stored attribution. An AI description awaiting approval shows a tinted card with the provider name, **Use suggestion**, and **Dismiss**. Accepted descriptions and tags use Frames’ regular styling.

Generated Light and Mood hints use the provider tint when their analysis has source information. The header's ✦ working icon and progress indicator use the colour of the provider processing the current task, including between photos in a batch. When multiple providers work simultaneously, the header uses the first reported provider. Colours are visual hints, not the only indication of provenance; AI suggestions still include ✦ and readable labels.

Old suggestions created before this feature do not have a recorded provider. They remain neutral instead of being attributed to the current AI. Deleting a provider also leaves its outstanding suggestions neutral. Shared providers are configured by the administrator, including their colour, and are read-only for members.

The palette is intentionally restricted to the built-in swatches to maintain consistent colour presentation. Original photographs remain untouched.
