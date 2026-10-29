# Local Video Player

[简体中文](README.md) | **English**

A lightweight, offline browser-based player for your own videos. Browse courses and chapters, play lessons continuously, adjust playback speed, and resume where you left off.

**Neither the repository nor the release archive includes videos. No account, uploads, or cloud service is required.** The interface uses a neutral light palette without third-party brand marks. Interface labels are currently in Simplified Chinese.

## Download and start

1. Open **Releases** on this repository and download `local-video-player-v1.0.0-windows-x64.zip`.
2. **Extract the entire archive** to a normal folder. Do not run the launcher from inside the ZIP.
3. Put your videos in the included `videos` folder.
4. Double-click **`Start Player.cmd`**. The player opens in your default browser.

The portable release targets **Windows 10 / 11 on 64-bit Intel / AMD PCs**. Its runtime is included; a separate Python installation is unnecessary. The automatically generated `Source code.zip` does not include the runtime. Choose the explicitly named portable ZIP for ready-to-use playback.

The local URL is `http://127.0.0.1:18768`. The service listens only on the local machine, not on your LAN. Double-click **`Stop Player.cmd`** to end the background service. Closing a browser tab does not shut down that service.

## Use an existing video folder

There is no need to copy videos already stored on another drive:

1. Open **`video-directory.txt`** in a text editor.
2. Replace its contents with a folder path, for example `E:\My Videos`. Use one line without quotation marks. Spaces, Unicode characters, and ordinary backslashes are supported.
3. Save and start the player. If it is already running, use `Stop Player.cmd` before restarting.

Relative paths resolve from the application folder; the default is `videos`. For a source checkout, the configuration file is optional. Copy `video-directory.example.txt` to `video-directory.txt` if you want to customize it. Choose your intended media folder rather than an entire drive.

## Suggested layout

```text
videos/
├─ Course One/
│  ├─ Chapter 1/
│  │  ├─ 01-Introduction.mp4
│  │  └─ 02-Basics.mp4
│  └─ Chapter 2/
│     └─ 01-Practice.mp4
└─ Course Two/
   └─ 01-Getting Started.mp4
```

Top-level folders become courses; deeper folders become chapters. Videos placed directly in the root appear under the miscellaneous course. Natural numeric sorting puts `2` before `10`. After adding files, click **刷新目录** (Refresh library). Rebuilding or reinstalling is unnecessary.

## Features

- Course and chapter navigation, lesson selection, and library-wide search.
- Autoplay within the current course or across the whole library; playback stops at the end.
- 0.5–3× playback speed, remembered volume, per-video resume positions, and completion markers.
- Native seeking controls, fullscreen, wide layout, and picture-in-picture where supported.
- A narrow-window layout and keyboard controls.

| Key | Action |
| --- | --- |
| Space / K | Play or pause |
| Left / Right | Seek backward or forward 5 seconds |
| Up / Down | Adjust volume |
| Shift + Left / Right | Previous or next video |
| [ / ] | Decrease or increase playback speed |
| F / T / M | Fullscreen / wide layout / mute |
| / | Focus search |

Focused text fields, menus, and buttons retain their own keyboard behavior. Space handling avoids double activation by native browser video controls; holding it down does not repeatedly toggle playback.

## Formats and saved progress

The library recognizes `.mp4`, `.webm`, `.m4v`, `.mov`, `.mkv`, and `.ogg`. **Recognizing an extension does not guarantee support for the codec inside it.** Decoding depends on your browser. There is no bundled transcoder, and original videos are not modified.

Progress, volume, and playback speed use browser-local storage. They do not automatically transfer to another computer or browser. Clearing site data, private browsing, or changing the service port can make previous records unavailable. Relative video paths identify lessons: renaming or moving folders affects that mapping, and a different library with identical relative paths can reuse existing progress.

## Run from source

Python 3.10 or newer is required. There are **no third-party Python runtime dependencies**:

```sh
python launch.py --open
```

For a foreground development server that you can stop with `Ctrl+C`:

```sh
python player/server.py --root ./videos --port 18768 --open
```

The Windows start/stop scripts target the portable release. Source commands may work on other operating systems, but the portable distribution is validated only on Windows x64. `Stop Player.cmd` targets only the player started by the embedded runtime in that extracted directory.

## Test and build

```sh
python -m unittest discover -s tests -v
python scripts/build_portable.py
```

The build script downloads an official embedded runtime, verifies its pinned SHA-256, and writes a video-free ZIP to `dist/`. Use `--runtime-zip /path/to/runtime.zip` to supply a previously downloaded file with the same expected checksum. An explicit packaging allowlist excludes videos, personal directory settings, private paths, and watch history.

## Troubleshooting

- **Empty library:** Check the directory setting and file extensions, then refresh the library.
- **Startup fails after changing folders:** Stop the previous service first. Do not start multiple copies on the same port.
- **Page unavailable:** Run the launcher first; inspect terminal errors when running from source.
- **Video cannot decode:** Use a browser-compatible codec or open the original in another player.
- **Updating:** Stop the player and preserve your videos and `video-directory.txt` before replacing application files. Do not overwrite your own media with an empty folder.

## License

Project source is provided under the [MIT License](LICENSE). The embedded runtime retains its separate license in `runtime/LICENSE.txt`. No courses, media assets, or third-party brand artwork are included.
