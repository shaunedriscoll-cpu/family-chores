# Family Chore Board: deploy steps

Set your PIN as a server setting. It is not stored in any file.

## Option A: Netlify CLI (about 10 minutes)

1. Install Node.js from nodejs.org if you do not have it.
2. Open a terminal in this folder and run:
   - npm install
   - npm install -g netlify-cli
   - netlify login
   - netlify sites:create --name your-family-chores
   - netlify env:set FAMILY_PIN 5828
   - netlify env:set PARENT_PIN your-own-parent-pin
   - netlify deploy --prod
3. Open the link it prints. Enter 5828.
4. On each iPhone: open the link in Safari, tap Share, tap Add to Home Screen.

## Option B: GitHub plus Netlify website

1. Put this folder in a new private GitHub repository.
2. In Netlify: Add new site, Import an existing project, pick the repository.
3. Leave the build command empty. Publish directory: public.
4. Site configuration, Environment variables: add FAMILY_PIN with value 5828, and PARENT_PIN with a different PIN that only parents know.
5. Trigger a deploy. Open the link and add it to each home screen.

## Change the PIN

Change the FAMILY_PIN value in Netlify, then redeploy. Everyone enters the new PIN once.

## Parent mode, assigned tasks and editing lists

- Two PINs: FAMILY_PIN (5828) opens the board. PARENT_PIN unlocks parent mode. Choose a different number for PARENT_PIN and keep it to yourself and Chungha.
- Tap the lock button at the top right, enter the parent PIN, and that phone stays in parent mode until you tap Lock.
- In parent mode, the Tasks tab shows the assign form. Pick a person, pick a task from the task bank or type a new one, set points and an optional due date.
- The Parent screen lets you add, remove and re-point the task bank, the daily chores and the rewards. No code editing and no redeploy.
- Each person sees their own open tasks, with a count on the tab. Done adds the points. Undo takes them back.
- Finished tasks stay listed for 30 days. Points stay in the totals.
- Changing a chore's points does not change points already earned.
- Ten wrong tries on either PIN lock that PIN for 15 minutes.

## Family chat

- The Chat tab holds messages, reminders and pinned family info.
- Anyone can send a message or a reminder. A reminder goes to one person or to everyone, with an optional date and time. The person taps Got it, and everyone sees who has.
- In parent mode you can pin family info at the top, such as appointments or schedules. Pinned notes stay until you remove them.
- Authors delete their own messages. Parents delete any message.
- The Chat tab shows a count of new messages since you last opened it. The board does not send push notifications yet, so people see new items when they open the app. The chat refreshes every 10 seconds while open.
- The chat shows the latest 100 messages and removes anything older than 60 days.
- Do not post passwords or private information. Anyone with the family PIN can read the chat.

## Notes

- 10 wrong PIN tries lock the board for 15 minutes.
- Days roll over at midnight Calgary time.
- Run the logic tests with: node test/logic.test.mjs
