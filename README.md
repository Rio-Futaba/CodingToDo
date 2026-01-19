As the second open version of this program, the following changes have been made:
Now the program allows Codeforces rating as well as DMOJ difficulty when inputting a problem. The two difficulties are currently interchangeable in the app.
Feedback in the previous version was that .exe files appear to be not welcome in GitHub, and I agree with that - this time there is just a clean .py file in the upload.
To have it run like a normal .exe, you can place it in one of your folders (or put raw in your downloads - just not on the desktop please), and then do:
`pip install pyinstaller` 
in your local cmd/windows shell/ide terminal.
After that, do
`pyinstaller --onefile --noconsole [your path to the .py file]`,
and the exe file would appear in that folder as well.
For convenience, it is also recommended to create a desktop shortcut for that file manually after that.

**Possible features coming up in the next updates:**
1. Maybe a browser extension?
2. Whatever feature the users report that they want ig :)
