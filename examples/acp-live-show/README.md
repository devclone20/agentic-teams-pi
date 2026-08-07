# acp-live-show — host-side trade wrapper

`demo-trade` is the host-side wrapper behind the **ACP LIVE** show: two pi
personas (iCLONE the seller, VEGETA the buyer) stage one real, gated $0.10
trade on the Virtuals ACP marketplace on Base, narrated as live ticker cards.
The showcase entry — video, on-chain receipts and the skill that drives the
personas — lives in
[Virtual-Protocol/acp-cli-demos → showcase/acp-live-iclone-vegeta](https://github.com/Virtual-Protocol/acp-cli-demos/tree/main/showcase/acp-live-iclone-vegeta).

## What it does

The wrapper stages **one** controlled trade and lets short-lived ssh callers
follow it without ever holding a long connection:

| Command | Effect |
| --- | --- |
| `demo-trade` (default `check`) | pre-flight only — **no funds move** |
| `demo-trade run` | launch the single real trade **detached** in a transient systemd unit; returns in ~1s |
| `demo-trade run new` | same, bypassing the 10-minute duplicate cooldown (owner re-takes) |
| `demo-trade status` | instant snapshot: derived state (`RUNNING / COMPLETE / FAILED / IDLE`) + last trade-log lines |

State is derived from the trade log, so a caller that lost its connection can
always recover the truth via `status`.

## Safety rails (enforced in metal)

- Refuses a second run while one is in flight.
- Cooldown after a completed trade, so a stray re-dispatch cannot double-spend.
- Hard-blocks relaunch after any failure that happened **after escrow funding**
  — that path requires manual inspection, never an automatic retry.

## Install

Copy `demo-trade` onto your ACP host (e.g. `/usr/local/bin/demo-trade`),
adjust the two paths at the top (your trade core script and log location), and
give the calling user passwordless sudo for it. The show's personas reach the
host through the ssh alias `acp-host`.
