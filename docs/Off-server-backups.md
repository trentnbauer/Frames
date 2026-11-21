# Off-server backups

An administrator can send the daily whole-server archive somewhere other than the server (*Settings, Server, Backup*). Photographs are not backed up: only the archive of people and libraries.

## Amazon S3 and compatible services

Works with S3 itself and S3-compatible services (MinIO, Backblaze B2, Wasabi). Enter the endpoint, region, bucket, an optional folder, and an access key and secret key. The secret is write-only: never shown again, and left out of backups. Addresses are path-style. The last seven archives are kept there, only Frames' own archives are ever removed, and they are listed under *Restore* so you can restore from them.

## Your own Dropbox, Google Drive or OneDrive

A separate sign-in for backups, with write access. Frames makes a folder called *Frames backups* and keeps the last seven there; restore from there too. This needs the service set up under *Settings, Cloud services* with an app registration that allows writing files. Dropbox archives over 140 MB are refused (use S3).

## Tested how

Tested against stand-ins built from each service's documented calls, not the real services.
