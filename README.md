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
