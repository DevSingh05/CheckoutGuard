# CheckoutGuard launch video: voice-over script

Video: `showcase/checkoutguard-demo.mp4` (1:22, 1920x1080, silent). Times are where each line should start. Read at a calm pace, about 150 words a minute. The on-screen captions carry the same ideas, so it's fine if a line runs a second long.

Every store, quote and score in the demo is fictional. The script says so once on screen and once out loud.

## 1. Hook (0:00–0:08)

| Time | Line |
| --- | --- |
| 0:00 | That store looks great. |
| 0:04 | But do you trust it with your money? |

## 2. Problem (0:08–0:16)

| Time | Line |
| --- | --- |
| 0:08 | It's a store you've never heard of. |
| 0:10.5 | The discount seems almost too good. |
| 0:12.5 | And it wants a payment you can't take back. |

## 3. Reveal (0:16–0:24)

| Time | Line |
| --- | --- |
| 0:16.5 | This is CheckoutGuard: a little clarity before checkout. |
| 0:19.5 | It's a Chrome side panel for the moment right before you pay. |

## 4. Demo (0:24–1:00)

| Time | Line |
| --- | --- |
| 0:24.5 | Here's lunar-outlet: a fictional store we made for this demo, with a great deal on a travel pack. |
| 0:27.5 | Open CheckoutGuard beside it and click "Check this store." |
| 0:30.5 | It reads the page for payment options, the return policy, contact details and the price. It looks up how old the domain is in public registration records, researches what buyers say on Reddit and checks every quote against the live page. Then it scans Instagram comments and runs an AI-text check on the store's reviews. |
| 0:34.7 | The read: pause before paying. |
| 0:37.4 | The domain is twenty-three days old, there's no return policy, and the price is seventy-two percent off. |
| 0:40.2 | Then it ranks how to pay, using only the methods this page accepts. |
| 0:43.0 | A credit card gives you chargeback rights. Zelle and crypto can't be reversed. |
| 0:45.8 | It shows how much money is at stake, |
| 0:47.7 | and what to do if something goes wrong. |
| 0:50.2 | It isn't alarmist. An older store with good buyer reports gets "fewer concerns found." |
| 0:54.2 | And when there's too little evidence, it says so instead of guessing. |
| 0:57.7 | Your recent checks stay on this device. |

## 5. How it works (1:00–1:12)

| Time | Line |
| --- | --- |
| 1:00.5 | Five kinds of public evidence go in: page signals, domain age, Reddit reports, Instagram comments and review text. |
| 1:03.5 | Plain code scores them into a risk index and shows how much evidence it found. Out come a decision, payment guidance, and an optional summary that's written only from that evidence. |
| 1:05.5 | AI researches and explains. Code computes the score. |
| 1:07.2 | You make the call. |

## 6. Close (1:12–1:22)

| Time | Line |
| --- | --- |
| 1:12.5 | CheckoutGuard. |
| 1:13.8 | Evidence, not a verdict. |
| 1:15 | It's on GitHub at DevSingh05/CheckoutGuard. |

## Notes for recording

- Say "risk index," never "scam score." The number is a heuristic, not a probability.
- Never say a store is "safe." The positive example has "fewer concerns found."
- To add the recording without re-encoding the video:
  `ffmpeg -i showcase/checkoutguard-demo.mp4 -i voiceover.wav -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart showcase/checkoutguard-demo-vo.mp4`
