# Logic — Concept Engine Protocol

A Chrome extension that operates the Concept Engine: a reasoning system designed to expand your map, not confirm it.

## What it does

Logic uses Claude AI to analyze your thinking through a formal protocol that:

- **Decomposes** every concept into Subject, Object, Relation, and Sought Value (VB)
- **Scores** fidelity on each component (0.0 to 1.0)
- **Gates** — concepts below threshold get flagged or reconstructed
- **Eliminates** — only what survives contact with territory in 3+ contexts is retained
- **Audits inheritance** — traces where your concepts came from and what distortion they carry
- **Declares limits** — unknown territory is marked, never filled with projection

## Features

- Side panel UI — always accessible while browsing
- Web page analysis — analyze any page through the Concept Engine lens
- Insight detection — automatic detection of genuine map expansions
- Corrections system — teach Logic from your corrections
- Collective intelligence — share discovered relations, receive verified updates from the network
- Persistent memory — insights and corrections persist across sessions

## Install

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select this folder
5. Click the Logic icon in your toolbar
6. Go to Options and enter your Anthropic API key

## Requirements

- Chrome browser
- Anthropic API key ([get one here](https://console.anthropic.com/))

## How it works

You bring your own API key. Logic sends your messages to Claude with the Concept Engine protocol as the system prompt. Your data stays between you and Anthropic's API — Logic stores nothing on external servers except anonymous relation data if you opt into the collective network.

## The Protocol

The Concept Engine operates on one formula:

```
C = S(v) x O(v) x R(v) | VB
```

Where C is concept fidelity, S is subject completeness, O is object alignment with territory, R is inferential chain strength, and VB is the sought value. Any component at zero collapses the entire concept.

The navigator is the map. The map is not the territory. The territory always wins.

## License

MIT
