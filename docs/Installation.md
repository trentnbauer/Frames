# Installation

**The recommended way: start with no settings, set everything up in the app, then export it.** You do not write an `.env` file by hand, and you never have to work out which variable does what.

1. **Start the minimal compose file.** It needs no variables at all. Save [`docker-compose.minimal.yml`](https://github.com/trentnbauer/Frames/blob/main/docker-compose.minimal.yml) in a folder, put your photographs in a `photos` folder beside it, and run:

   ```sh
   docker compose -f docker-compose.minimal.yml up -d
   ```

   (It needs Docker Compose 2.24 or newer. Frames listens on this machine only, `127.0.0.1:3000`, until you decide otherwise.)
2. **Open it** at http://localhost:3000, go to **Photoshoots** and press **Sync library** (or **Upload photos**).
3. **Fill in the settings** in the app, under **Settings**: sign-in (Access), AI sources and their keys, cloud accounts, your portfolio and its address, and the Cloudflare tunnel. Everything is tried and saved as you go.
4. **Export them.** Open **Settings, Env file**, turn on **Allow exporting the env file** (it is off by default, and asks you to sign in again if sign-in is on), and press **Download frames.env**. That one file holds everything you configured, secrets included.
5. **Put it next to the compose file** (same folder, named `frames.env`) and run `docker compose -f docker-compose.minimal.yml up -d` again. The compose file picks it up by itself. From now on that file is the source of truth: its values win over the app every time Frames starts, and it switches the export off (`ALLOW_ENV_EXPORT=false`) so the secrets cannot be downloaded a second time.
6. **Keep it safe.** `frames.env` holds every secret: keep it private, back it up, and never commit it. To change a setting for good, change it in the app, then set `ALLOW_ENV_EXPORT=true` in `frames.env`, restart, turn the export switch on again and export a new file.

Using Portainer or another way of giving a stack its variables? Do the same steps, then load `frames.env` as the stack's environment (Portainer: *Stack, Environment variables, Load variables from .env file*) with [`docker-compose.portainer.yml`](https://github.com/trentnbauer/Frames/blob/main/docker-compose.portainer.yml), which passes the variables on. More on the export, including what it does and does not contain, is under *Setting up without any variables, then exporting an env file* below.

- Your photos are mounted **read-only**. Frames never writes to them (see [XMP](XMP) below for the one opt-in exception).
- The database and generated previews live in the `frames-data` volume. Back that up (see [Backup and restore](Backup-and-restore)).
- The container runs as an unprivileged user with a read-only filesystem, no extra capabilities, and a health check.


## Building from source, or writing the variables yourself

```sh
cp .env.example .env        # then edit it: at least PHOTOS_DIR
docker compose up -d --build
```

Open http://localhost:3000. This builds the image from this repository and passes every variable in the tables below through `.env`. Use it if you want to build your own image, or prefer to write the variables by hand.
