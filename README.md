#### AI slop!
# Frames
Manage your photography micro-projects

## Security

Frames has no built-in login, users, or access control — every route
(viewing/deleting photos, restoring from backup which replaces the entire
library, vision-provider API keys) is open to anyone who can reach the
server. Don't expose it directly to the internet. Put it behind a reverse
proxy with auth (Caddy, nginx, Traefik + Authelia/oauth2-proxy/basic auth),
or keep it on a private network / VPN / Tailscale only.
