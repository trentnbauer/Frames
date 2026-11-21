# Known limits

- **RAW files**: every RAW (uploaded or in a library) gets a JPEG thumbnail and preview. Frames uses the biggest JPEG the camera embedded (found with ExifTool, so it works across makers). If there is none or it is small, the RAW is developed with `dcraw` just to make the preview. The RAW itself is never changed. Checked with a real Nikon D5600 file and the ExifTool sample set (Canon, Nikon, Fuji, Panasonic, Adobe DNG), not every camera. A file with no picture data at all shows a placeholder.
- **AI**: tested against a stand-in model server, not against real models. Quality depends on the model you choose.
- **Cloud storage**: built-in sync covers Google Drive, Dropbox and OneDrive (see [Cloud sync](Cloud-sync)), and any other drive that can be mounted as a folder (S3, WebDAV, SMB, with rclone for example) works as a library. There are no built-in S3 or WebDAV connectors. The three services are tested against stand-in servers, not the live services.
- **Access**: there are three roles, administrator, member and guest; there are no finer permissions, and no sharing of one library between people except by share links and downloads. OAuth sign-in is tested against stand-in providers that follow the standards, not against live Google, GitHub or Microsoft.

- Display preferences for start page, print units and date format currently save but are not applied throughout the app.
- Composition ideas require three eligible photos sharing a usable feature, consider up to 400 eligible photos and return up to six ideas. See [Composition ideas](Composition-ideas).
- Passkeys need HTTPS or localhost and device support. Test actual identity providers/authenticators before enforcing 2FA. The mobile UI has separate ongoing design work; the screenshots document the desktop layout.


## What Frames is not

Left out on purpose, to stay a small tool for one photographer's portfolio: photo editing or RAW development, photobook creation or print-lab ordering, exhibition management, social networking or public galleries beyond the one portfolio page, simultaneous collaborative editing of one shared library, a photography journal, gamification or challenges, heavy analytics and reporting, automated publishing to other services, two-way file synchronisation, training your own AI models, and elaborate ranking algorithms.
