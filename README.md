# ClassTrack

## Roles & approvals

| Role    | How the account is created                              | Who approves it                 |
|---------|---------------------------------------------------------|---------------------------------|
| Student | Self-registers (email or Google)                        | Active immediately              |
| Teacher | Self-registers (email or Google)                        | **An administrator only**       |
| Admin   | Registers normally, then promoted by hand in Firebase   | n/a (cannot self-register)      |

Admins use the **Admin Console** to approve, reject, **revoke**, and restore teachers, and to
read the audit log. A revoked teacher is locked out immediately, even if currently signed in,
and the Firestore rules enforce it on the server (not just in the UI).

## One-time setup: create the first admin

1. Open the app and **create an account** with the email you want to use as admin
   (choose "Student", or sign in with Google). Sign out.
2. **Firebase Console → Firestore Database → `users` → the document for that account**
   (the document ID is the user's UID; the `email` field will match).
3. Edit the document:
   - `role` → `admin`
   - `approved` → `true` (boolean)
   - optional: delete the `studentId` field.
4. **Deploy the security rules** (the GitHub Pages workflow does not deploy them):
   `firebase deploy --only firestore:rules`, or paste `firestore.rules` into
   Firestore → Rules → Publish.
5. Sign in again with that account. You will land on the Admin Console.

Teachers who register after that appear under **Pending** in the Admin Console.

## What each role can do

| Action                                   | Student | Teacher                      | Admin                  |
|------------------------------------------|:-------:|:----------------------------:|:----------------------:|
| Use teacher tools (classes, attendance)  | no      | yes (after admin approval)   | **yes (acts as a teacher too)** |
| Approve / revoke / delete teachers       | no      | **no**                       | yes                    |
| Edit or delete a class, remove students  | no      | **only classes they created** | any class              |
| Join or leave a class                    | yes (themselves only) | yes             | yes                    |

The admin uses the **Teach** button in the Admin Console to work as a teacher, and the **Admin Console**
button in the header to go back. These limits are enforced in `firestore.rules`, not just in the UI.

**Deleting a teacher** (trash icon in the Admin Console) removes their ClassTrack profile; if they are signed in
they are logged out, and they can no longer sign in with email. Their Firebase *login* can only be removed from
Firebase Console → Authentication; until you do that, the same email cannot be used to sign up again. Use
**Revoke** if you only want to block access and keep the record.

## Broadcast to all students (works with no class)

The **Broadcast** tab lets a teacher message every student, even students who are not in a class yet. The teacher
can attach the join code of one of their classes; students then see the code with **Copy** and **Join class**
buttons. A student with no class opens on this tab automatically. Only teachers (and the admin) can post; only the
author or the admin can delete a broadcast.
