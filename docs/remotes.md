# Remotes

<!-- Made by scripts/gen-remotes-doc.py from server/lib/remotes.json: edit that file, then run the script. -->

The LG remotes Glasshouse knows, with the Remote tab keys each is known to have. A remote not listed here, or a list with a button missing, is fine to add: see [Adding a remote](#adding-a-remote).

| Remote | Year | Reported by the TV as | Keys known | List complete |
| :----- | :--- | :-------------------- | ---------: | :------------ |
| [Magic Remote MR26GA](#mr26ga) | not known | `LGE MR26GA` | 4 | no |

How sure each fact is:

* **Measured:** seen on a TV: a press read from the remote, or a filter that received it.
* **Documented:** stated in LG's manual or in this project's docs.
* **Assumed:** expected, not confirmed.

## Magic Remote MR26GA

<a id="mr26ga"></a>

Reported by the TV as `LGE MR26GA` (assumed). Has no number keys. The list of keys below is what is known so far, not every button.

| Remote tab key | Evidence |
| :------------- | :------- |
| Netflix (`netflix`) | measured |
| Prime Video (`amazon`) | measured |
| Channel up (`channelup`) | measured |
| Channel down (`channeldown`) | measured |

The name the TV reports for this remote has not been read yet; LGE MR26GA follows the others' pattern. The rest of its buttons are to be listed.

Where this comes from:

* OLED48C56LB, webOS 10.3.0, 17 November 2026: presses of these keys read from the remote's input device, and CH+ and CH- received by the key filter
* This remote has no number keys

## Adding a remote

The catalogue is [`server/lib/remotes.json`](https://github.com/rorygallagher2024/glasshouse/blob/main/server/lib/remotes.json). To add a remote, or a button to one, add or edit its entry there and run `scripts/gen-remotes-doc.py`, which rewrites this page; `scripts/check-all.sh` fails while the two disagree.

* `id`, `title`, `names` (what the TV reports: the paired remote's name on the Metrics tab, or `remote_type` in `/var/log/messages`), `year` and `numberKeys` (`null` where not known).
* `keys`: the Remote tab key ids (the `KEYS` list in `server/lib/remotekeys.js`) with how sure the fact is.
* `complete`: `true` only when the list is every button the remote has. Only a complete list lets the Remote tab treat a key as not on that remote.
* `sources`: which TV and webOS version each fact came from.
* `image`: the file name of a small picture under `server/assets/remotes/`, about 160 px wide, a PNG with a transparent background, under 20 KB, original artwork or a picture you may share. A remote without one shows the generic outline. The file also goes in `FILES` in `server/deploy.sh`.
