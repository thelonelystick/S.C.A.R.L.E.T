# S.C.A.R.L.E.T. desktop companion

This optional Electron utility gives the operator five local controls. The website runs independently. Desktop actions start inside the companion window. The companion has no inbound HTTP service, pairing token, task subscriber, background agent, or account access.

## Start on your computer

Use Node.js 22.16 or later and an Electron-supported desktop with a graphical session. From the extracted project directory, run

```sh
cd companion
npm ci
npm exec -- install-electron
npm start
```

The runtime installer downloads the official binary matching the pinned Electron package and native platform. Local filesystem controls work independently of the web server. To use **Open dashboard**, start the web app as described in the project setup guide. The default address is `http://127.0.0.1:3000/dashboard`. Set the port before launching the companion if the app uses another port

```sh
SCARLET_DASHBOARD_PORT=4317 npm start
```

On PowerShell, set `$env:SCARLET_DASHBOARD_PORT = "4317"` and run `npm start`. Opening the dashboard uses the system browser and its existing login session. The desktop window does not receive web account credentials.

## Use a session

Select **Open session**, then enable the controls you need.

| Permission | Available action |
| --- | --- |
| Folder search | Pick one folder through the system dialog. Search the snapshot of regular, visible filenames in that folder. The scan covers up to 5,000 direct entries and displays at most 100 matching names. Choose the folder again to refresh. |
| Read text | Select one UTF-8 TXT, Markdown, CSV, or LOG file up to 256 KiB. Its contents appear in the editor. |
| Save text | Use the save dialog to create a new TXT file up to 256 KiB. Existing files are preserved. New files are committed with a hard link on the chosen filesystem. |
| Dashboard | Open the configured loopback dashboard in the system browser. |
| Notifications | Use **Test notification** to request one fixed local notification. Display depends on OS notification settings. |

The main process checks the selected permission for every operation. File actions use native pickers. The UI receives display names and the selected text. Folder permission stores a bounded filename snapshot in process memory. Reads reject symlinks, binary text and oversized input. The activity log retains the latest 40 actions during the window lifetime.

**Disconnect** revokes grants, invalidates pending authorization checks, clears the filename snapshot and clears the editor. Closing the window quits Electron. The renderer runs sandboxed with context isolation, packaged local UI assets, a restricted preload bridge and a restrictive Content Security Policy. The main process accepts IPC only from the single window’s trusted top-level frame. It rejects page navigation, popup windows, downloads and renderer permission requests. Session permissions are never written to disk.

## Verification

```sh
npm test
npm run test:smoke
```

The Node tests verify capability isolation, revocation, loopback restrictions, bounded file reads, UTF-8 validation, search behavior and create-only saves using temporary fixtures. The GUI smoke test starts a hidden native Electron window, checks renderer isolation, exercises the session controls and a permission toggle, then disconnects and exits.

Both test commands passed on macOS during project preparation. The live native file selection, browser opening and desktop notification delivery require a person with the target machine. Windows and Linux runtime behavior and signed installers were not verified. Distribution as a signed native application requires platform packaging, signing and any applicable notarization.
