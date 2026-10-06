# Maido animations (.vrma)

Drop `.vrma` files straight into this folder, then press **refresh** in
Settings → Character. Each file is matched to the emotion engine **by its name**:

```
<kind>.<key>[.<variant>].vrma
```

| kind | key | when it plays |
| --- | --- | --- |
| `idle` | an emotion or `any` | Looping while she's listening. Several variants per emotion rotate every 18–38 s |
| `talk` | an emotion or `any` | Looping while a reply is being "spoken" (falls back to idle) |
| `react` | an emotion | Played once when her emotion changes mid-reply and the brain sent no gesture |
| `gesture` | any slug (`clap`, `blow-kiss`, …) | Played once when the brain sends `gesture="<key>"`. **New keys are offered to the LLM automatically** |
| `intro` | `any` | Played once when the character appears (entrances, "pop up and greet") |

Emotions: `neutral happy excited sad angry surprised relaxed thinking shy`.
Fallbacks: excited → happy, shy → happy, relaxed → neutral, then `neutral`, then `any`.
An emotion without its own idle clip still shows its arm/head posture procedurally
on top of whatever idle is playing. Files that don't follow the pattern appear under
"Unsorted" in the sidebar (preview only) until renamed. Faces (VRM expressions),
blinking, gaze, and lip-sync always come from the director, never from the clip.

Gestures should start and end standing roughly where the idle stands: a clip
that crouches or walks makes every use of it look like a jump. Use those as `intro`.

Gesture and reaction clips triggered by the brain are cut after 5 s with a fade
(photo-booth clips run 7–12 s); previews from the sidebar play in full.

**Installed now:** `idle.neutral.chatvrm` (pixiv ChatVRM, MIT) and the VRoid 7-pack
(`intro.any.vroid-greeting`, `gesture.show-off`, `gesture.peace`, `gesture.finger-gun`,
`gesture.spin`, `gesture.pose`, `gesture.squat`). Their terms are in `licenses/`.

Built-in gestures that already work **without files** (a clip with the same key
replaces them): `wave nod shake think shrug cheer bow tilt`.

---

## Where to get them

1. **VRoid official 7-pack (free, .vrma ready)**: [BOOTH: VRMアニメーション7種セット](https://vroid.booth.pm/items/5512385).
   Commercial and modified use allowed with credit; no redistribution. Rename:
   | file in zip | save as |
   | --- | --- |
   | VRMA_01 Show full body | `gesture.show-off.vrma` |
   | VRMA_02 Greeting | `intro.any.vroid-greeting.vrma` (starts crouched and steps forward, so it's an entrance, not a wave) |
   | VRMA_03 Peace sign | `gesture.peace.vrma` |
   | VRMA_04 Shoot | `gesture.finger-gun.vrma` |
   | VRMA_05 Spin | `gesture.spin.vrma` |
   | VRMA_06 Model pose | `gesture.pose.vrma` |
   | VRMA_07 Squat | `gesture.squat.vrma` |
2. **Mixamo (free with an Adobe account, biggest library)**: [mixamo.com](https://www.mixamo.com/).
   Download as **FBX, "Without Skin", 30 fps**, then convert to .vrma locally with
   [fbx2vrma-converter](https://github.com/tk256ailab/fbx2vrma-converter) (MIT):
   ```sh
   node fbx2vrma-converter.js -i ./fbx/ -o ./animations/
   ```
   Mixamo's licence allows use in your projects but not redistributing the raw files.
3. **VRoid Hub / BOOTH community packs**: search "VRMA" on BOOTH ([example collection](https://booth.pm/en/items/5520942)). Check each pack's terms.
4. **Make your own**: [Librn Editor](https://editor.librn.com/) edits VRMA in the browser.

Only use animations whose licence allows your use. Nothing in this folder is sent anywhere.

---

## Shopping list: a full waifu motion set

The **Mixamo search** column holds keywords to type into Mixamo's search. Titles
change over time, so pick the clip that looks right. ⭐ = start with these
(about 20 files covers most conversations).

### Idle loops (as many variants as you like; they rotate)

| save as | Mixamo search | feeling |
| --- | --- | --- |
| ⭐ `idle.neutral.breathing.vrma` | Breathing Idle | calm default |
| ⭐ `idle.neutral.weight-shift.vrma` | Weight Shift | natural standing |
| `idle.neutral.look-around.vrma` | Looking Around | curious, waiting |
| `idle.neutral.standing.vrma` | Standing Idle / Idle | plain idle |
| `idle.neutral.arms-crossed.vrma` | Standing Arms Crossed | composed |
| `idle.neutral.hands-behind.vrma` | Hands Behind Back / Idle (female) | polite maid stance |
| ⭐ `idle.happy.bouncy.vrma` | Happy Idle | cheerful |
| `idle.happy.sway.vrma` | Swaying / Happy | content |
| `idle.happy.hum.vrma` | Idle Dance / Bouncing | playful |
| ⭐ `idle.excited.jumpy.vrma` | Excited / Jumping | can't sit still |
| ⭐ `idle.sad.vrma` | Sad Idle | down |
| `idle.sad.kick-ground.vrma` | Sad / Disappointed | sulking |
| ⭐ `idle.angry.vrma` | Angry / Standing Angry | annoyed |
| `idle.angry.arms-crossed.vrma` | Arms Crossed Angry | pouting |
| `idle.relaxed.stretch.vrma` | Idle (relaxed) / Lazy | chilled |
| `idle.relaxed.sleepy.vrma` | Sleepy / Tired idle | late night |
| ⭐ `idle.thinking.vrma` | Thinking | waiting for the LLM |
| `idle.thinking.chin.vrma` | Thoughtful | deep in thought |
| ⭐ `idle.shy.vrma` | Bashful / Shy | flustered |
| `idle.shy.fidget.vrma` | Nervously Look Around | nervous |
| `idle.surprised.vrma` | Surprised idle / Startled | still shocked |
| `idle.any.bored.vrma` | Bored | after a long silence |

### Talking loops (during replies)

| save as | Mixamo search |
| --- | --- |
| ⭐ `talk.neutral.vrma` | Talking |
| `talk.neutral.explain.vrma` | Explaining / Hands Gesture Talking |
| ⭐ `talk.happy.vrma` | Happy Talking / Laughing while Talking |
| `talk.sad.vrma` | Sad Talking |
| `talk.angry.vrma` | Angry Talking / Arguing |
| `talk.thinking.vrma` | Thoughtful Talking |
| `talk.excited.vrma` | Excited Talking |

### Reactions (when her mood flips mid-sentence)

| save as | Mixamo search |
| --- | --- |
| ⭐ `react.surprised.vrma` | Surprised / Startled / Reaction |
| `react.happy.vrma` | Happy reaction / Fist Pump (small) |
| `react.sad.vrma` | Defeated / Disappointed |
| `react.angry.vrma` | Angry Gesture / Annoyed |
| `react.shy.vrma` | Bashful / Embarrassed |
| `react.thinking.vrma` | Thinking (short) / Head Scratch |

### Gestures (the LLM picks these by name)

| save as | Mixamo search | used for |
| --- | --- | --- |
| ⭐ `gesture.wave.vrma` | Waving | hello / bye |
| ⭐ `gesture.nod.vrma` | Head Nod Yes | yes |
| ⭐ `gesture.shake.vrma` | Shaking Head No | no |
| ⭐ `gesture.clap.vrma` | Clapping | applause |
| ⭐ `gesture.laugh.vrma` | Laughing | something funny |
| `gesture.cheer.vrma` | Cheering / Victory | celebrating |
| `gesture.bow.vrma` | Quick Formal Bow | thanks / sorry |
| `gesture.shrug.vrma` | Shrugging | "dunno" |
| `gesture.think.vrma` | Thinking / Head Scratch | pondering |
| `gesture.point.vrma` | Pointing | "look at this" |
| `gesture.blow-kiss.vrma` | Blow A Kiss | affection |
| `gesture.heart-hands.vrma` | (VRoid/BOOTH packs) | love |
| `gesture.facepalm.vrma` | Facepalm / Disappointed | exasperated |
| `gesture.stretch.vrma` | Arm Stretching | waking up |
| `gesture.yawn.vrma` | Yawn | sleepy |
| `gesture.salute.vrma` | Salute | "yes, master!" |
| `gesture.fist-pump.vrma` | Fist Pump | determination |
| `gesture.hands-on-hips.vrma` | Standing Arms on Hips / Being Cocky | confident / scolding |
| `gesture.hand-on-chest.vrma` | Acknowledging / Thankful | sincere |
| `gesture.dismiss.vrma` | Dismissing Gesture | "never mind" |
| `gesture.explain.vrma` | Hands Forward Gesture | explaining |
| `gesture.agree.vrma` | Agreeing | strong yes |
| `gesture.cry.vrma` | Crying | very sad |
| `gesture.pout.vrma` | Annoyed Head Shake | sulking |
| `gesture.cover-face.vrma` | Embarrassed / Cover Face | very embarrassed |
| `gesture.sigh.vrma` | Relieved Sigh | relief |
| `gesture.jump.vrma` | Jumping / Joyful Jump | excited bounce |
| `gesture.spin.vrma` | (VRoid 7-pack) | twirl |
| `gesture.dance.vrma` | Silly Dancing / Hip Hop Dancing | party |
| `gesture.peace.vrma` | (VRoid 7-pack) | cute pose |
| `gesture.show-off.vrma` | (VRoid 7-pack) | showing her outfit |

---

## Emotion → what gets rendered

| emotion | face (VRM expressions) | procedural posture if no clip | clips used |
| --- | --- | --- | --- |
| neutral | — | relaxed stand, breathing | `idle.neutral.*`, `talk.neutral.*` |
| happy | happy 0.75 | chest up, light bounce, arms open | `idle.happy.*`, `talk.happy.*`, `react.happy.*` |
| excited | happy 0.9 + surprised 0.25 | arms up-front, bigger bounce | `idle.excited.*` → happy |
| sad | sad 0.85 | head down, shoulders drop, slow breath | `idle.sad.*`, `talk.sad.*`, `react.sad.*` |
| angry | angry 0.85 | lean in, shoulders up, fists | `idle.angry.*`, `talk.angry.*`, `react.angry.*` |
| surprised | surprised 0.9 | lean back, hands to chest | `idle.surprised.*`, `react.surprised.*` |
| relaxed | relaxed 0.7 | slow sway, head tilt | `idle.relaxed.*` → neutral |
| thinking | relaxed 0.2 + sad 0.08, eyes up | hand to chin | `idle.thinking.*` (also while waiting for the LLM) |
| shy | happy 0.35 + relaxed 0.35 | head down-tilt, hands clasped | `idle.shy.*` → happy, `react.shy.*` |

Intensity (0.2–1.0) from the LLM scales both the face and the posture.
