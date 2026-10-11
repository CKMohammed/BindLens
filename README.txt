BINDLENS 4.5
============
Your documents, bound into books.

INSTALL / UPDATE (Windows) - 4.5: THE WINDOWS PROGRAM
  Download "BindLens Setup.exe" (github.com/CKMohammed/BindLens > Releases) and run it: no Python and no
  administrator rights needed. It installs BindLens in %LOCALAPPDATA%\Programs\BindLens, with its icon on the
  desktop and in the Start menu. To update: run the new "BindLens Setup.exe". If Windows says "Windows protected
  your PC" (the installer is not signed yet): More info > Run anyway.

INSTALL FROM THE PYTHON FILE (the way before 4.5 - still works)
  1. Python from python.org (tick "Add python.exe to PATH") - only the first time.
  2. Right-click BindLens.zip > "Extract All" (do not run it from inside the zip).
  3. Open the extracted folder and double-click "Install.bat". It installs what BindLens needs, copies
     BindLens to its own place (%LOCALAPPDATA%\BindLens App) and puts the BindLens icon - with the logo - on
     your desktop and in the Start menu. From then on, open BindLens with that icon.
     You can delete the zip and the extracted folder afterwards. To update: do the same with the new zip -
     or simply drop the new zip on the BindLens window.
  BindLens remembers your books, positions and settings in
  %APPDATA%\BindLens - they stay there even if you move or update the app.

LICENCE, PRIVACY AND LEGAL
  BindLens - Copyright (C) 2026 Mohammed Chahboune Kadi.
  BindLens is free software under the GNU Affero General Public License v3 (AGPL-3.0): you may use, study,
  share and change it; if you give it to others, give them its source code (the file BindLens.pyw) and the
  same licence. It comes with NO WARRANTY. The name "BindLens" and its logo are not licensed as trademarks.
  - LICENSE.txt: the full licence.
  - NOTICE.txt: copyright, the source code, and the parts BindLens is made of with their licences
    (PyMuPDF / MuPDF by Artifex - AGPL; Python; Tcl/Tk; tkinterdnd2 and tkdnd; Tesseract data; photos).
  - PRIVACY.txt: BindLens has no account, collects nothing and sends nothing; it uses the internet only when
    you ask (photos, a calendar link, the data to read scans).
  In BindLens: Help > Licence, privacy and legal… (and Help > About).
  4.3.1: PDFs that BindLens creates (reports, new pages…) say in their properties that they were made with
  BindLens and PyMuPDF under the AGPL. Your own PDFs are not changed.

NEW IN 4.5
  - BindLens is a Windows program: "BindLens Setup.exe" (built on GitHub - the source code stays free, in the
    program's folder and on github.com/CKMohammed/BindLens). Your books, marks and settings are the same ones
    (%APPDATA%\BindLens). In the program, updating means running the new installer.

NEW IN 4.4.4 - the PIN screen can no longer get stuck
  - 4.4.3 could stop the PIN from being typed on some Windows computers (big or high-resolution screens): the
    moving colours took all the computer's time. Now they slow down by themselves when the computer is slow
    (never more than about a fifth of the time), the PIN is checked in the background, and BindLens opens at
    most a second and a half after the right PIN, whatever happens. No other window can come over the PIN or
    hold the mouse or the keys. The number pad works too (also with Num Lock off).
  - If you ever cannot get in: close BindLens, delete pin.json in %APPDATA%\BindLens and open it again - it
    opens without a PIN (your books, documents and marks are not touched).
  - The new PIN screen: a paper file - the BindLens logo on its tab - with a leather strap held by a brass
    combination padlock. Each digit turns a wheel; the right PIN springs the shackle, the padlock drops and the
    file opens. The keys are like an old typewriter's.
  - Gallery: Esc (or Exit) after looking at a picture brings you back to the gallery with all the pictures.

NEW IN 4.4.3
  - Gallery (a folder of pictures): click a picture to see it big, in its frame, with the film strip and the
    effects (Left / Right the next one, Esc back to the gallery). The bar at the bottom of a gallery has two new
    buttons: the picture (see them big) and the palette (Personalise the gallery: the frame in the gallery, the
    frame when one is big, how the next one comes in, the slideshow). The viewer has "Personalise" and "Effect".
  - Home: every book shows its first page again, also when the helper could not draw it.
  - PIN: typing the PIN and pressing Enter counts as one try (not two); an empty try is not counted; the keys go
    back to the PIN whenever BindLens is active again.
  - Windows title bar: one start that did not finish no longer switches BindLens's own bar off - only two in a
    row; a new version tries it again. Help > About says which title bar is in use (and why) and where BindLens
    runs from.

NEW IN 4.4.2
  - Windows: the PIN screen sits under BindLens's own top band again - the frame starts at the very top as in
    4.3, with minimise / maximise / close; the band shows only "BindLens" until the PIN is right (no menus).
  - Pictures: the effects stay between the cards beside the picture (nothing slides over the contents or the
    clock any more).
  - The PIN screen's moving colours use less of the computer (the same speed, fewer pictures a second).

NEW IN 4.4
  - The PIN, always first. Once you set a PIN, BindLens asks for it before anything shows: Home appears only
    when the PIN is right (before 4.4 Home could come over the PIN screen). The PIN screen is a paper file
    closed with a brass lock - each digit turns a wheel, the right PIN opens the file - with the app's colours
    moving fast behind it. The window keeps its minimise / maximise / close buttons and can be moved.
  - Pictures come in with effects: slide, push, drop, wipe, blinds, flip card, mosaic - or a different one each
    time. Click "Effect" at the top of a picture while reading (or Personalise > Reading mode).
  - Videos (mp4, m4v, mov, avi, wmv, mkv, webm, mpg, 3gp, mts): each is a card in its book (a folder of photos
    and videos is still a gallery). Double-click it - or the big play button while reading - to play it inside
    BindLens: Space play / pause, Left / Right 10 seconds, M sound, Esc close. It uses Windows' own media engine
    (nothing to install); if Windows can't play it there, it opens in your video player. Right-click > Open it
    in my video player. Videos are never read into memory, so big ones do not slow BindLens down.
  - Home: "Personalise" in the bottom-right corner opens a slim panel - the layout of your books (circle, cover
    flow, wave, shelf, grid), their size (small, medium, large), what is behind them (the app's colours, yours,
    a photo, plain) - and Home changes at once behind it.
  - One logo, the original: the bound book (its spine with the rings) and the gold lens - always the same. Only
    its background colour can be chosen: nine colours or your own (Personalise > Logo, or Settings > Logo -
    background). (4.4.1: 4.4 had kept the wrong one - the pages and lens.)

NEW IN 4.3
  The frame from the very top (Windows)
  - The top bar is BindLens's own: the menus, the document and minimise / maximise / close sit in the
    frame's colours, so the frame starts at the very top of the window (also while reading).
  - Drag the bar to move the window; drag its edges or corners to resize it; double-click the bar (or the
    square) to maximise - the taskbar stays visible; drag the bar to the top of the screen to maximise, to a
    side to take half the screen; the line minimises (click BindLens on the taskbar to bring it back).
    Alt+F4 always closes. It was tried first with a small test window on Windows.
  - Personalise > The frame > "BindLens's own title bar" switches it off (the normal Windows bar comes back).
    If BindLens ever fails to start with it, the next start uses the normal bar by itself and says so.
  Home - calm and minimal
  - Your books in the middle: on a slowly turning circle (the wheel or the arrows turn it), or as a cover
    flow, a wave, a shelf or a grid. Click a book to open it. Continue, Find and a row of small icons
    (Read, Recent, Reports, Print, Reminders, All my books, Add a folder). "Dates that need you": one chip.
  - Behind it: a lava of the app's colours that drifts slowly - or your own colours, your photo, or a photo
    from the internet (Wikimedia Commons / Lorem Picsum). Never moves in Fast mode.
  - The frame round the window turns gold on Home, like the logo's lens (Gold is also a frame colour now).
  - The palette icon on Home (or Personalise > Home) changes all of it, and "Show Home when BindLens starts".
  Pictures
  - The gallery (a folder of pictures) puts each picture in a frame: Polaroid with its name written below,
    museum (white mount, black frame), gold, the frame's colours, or none.
  - Reading (F6) a folder of pictures: one picture at a time, big, in its frame, with its name, number and
    date, and a film strip below - click a small one to go there; ← → or the wheel; the next one slides in.
    The slideshow (Play in the top bar) works there too. Personalise > Reading mode: the frames, on / off.
  Reading
  - Print in the top bar while reading - the same Print window as always (Ctrl+P works too).

NEW IN 4.2
  Fixed
  - Pages that came out black (some Word pages): a page that can't be drawn is tried again; if it still
    fails it shows white with why, "Open in its own program" and "Try again" - and the reason goes in the
    error log. A slow file says so in the status line instead of showing an empty page.
  - Writing in PDFs: letters are never lost any more (accents, ñ, Ó, €, “ ”, – …) - in the Text tool, notes,
    stamps, the page editor and Ctrl+E. Ctrl+E also kept the wrong font sometimes; fixed.
  - The GO TO list beside all the pages: long names were written over each other - now one clear line each.
  - The calendar (and the clock) covered the page when you zoomed in - now they step aside.
  The frame
  - One ring of colours round the whole window: the colours turn the corners (they sweep round them)
    instead of meeting in a cut, the same moulding all round (dark outer edge, light line, soft light, a
    shadow) mitred at the corners, one round of colours that closes exactly, and one thin shadow where the
    frame meets the page area. (4.2.1)
  - 4.2.2: the window opens with the normal Windows title bar again (BindLens's own title bar left the window
    off the screen on Windows - it is switched off). On Windows 11 the title bar and the window's edge take the
    frame's colours. The window always opens on the screen (a saved place off the screen comes back to the
    middle). The PIN screen takes the keyboard's digits again, wherever the focus is.
  Zoom
  - The page always stays in the middle of the screen; the cards beside it get narrower, then hide.
  - Zoom out little by little: under 35% more pages appear beside each other, one column at a time, until
    they fill the screen. Click a page to open it; zoom in to go back.
  - F4 (all the pages): the GO TO list has the kind of each file, its pages, "copy" when it is a copy of
    another, folders that fold, and a box to find a document.
  Reading
  - The top bar always shows the book, the document and the page, with "Choose what to read" and "Exit".
  - Personalise > Reading mode: background (the app's colours, your colours, dark, as usual), movement,
    pages (white, warm paper, night), contents and clock beside the page, the thin lines, the slideshow.
  - The clock you chose for reading is the one shown (it showed the sky card anyway).
  Pictures
  - A folder with only pictures opens as a gallery (four across); click one to see it big.
  - Read (F6) plays them as a slideshow (3 to 15 seconds, Pause in the top bar), with the frame's colours
    round each picture.
  More
  - Drag the clock anywhere, like the calendar (right-click > Put the clock back).
  - Ctrl+E: a small bar under the line - the original font, size and colour first; change the font, the size,
    the colour, bold or italic if you want.
  - Reports carry no date unless Settings > Reports > "Show the date each report was made".
  - Reports: "People, forms & checks" (was "Staff & children"), "File checks per person", general wording.
  - Help > What BindLens changed in my folders: every file BindLens added, moved, renamed or made, with the
    date. BindLens never copies a file by itself (only when you add files from elsewhere and choose Copy).
    Files called "… - copia" are made by Windows when a file is copied and pasted in the same folder.

NEW IN 4.1
  BindLens in a frame
  - The menu row at the top (File, Edit, Pages, View, Help - with the book and the document in the middle),
    the tips line at the bottom and the quick bar on the right are now one band of slowly moving colours
    round the app, like a picture frame. The text in it is easy to read but quiet. Alt or F10 opens the menus.
  - Personalise > Frame (also the frame icon in the quick bar): flowing / still / off, colours (yours, aurora,
    ocean, sunset, forest, grey or your own three), speed, thickness. Windows 11: the title bar takes its colour.
  Reading and moving round
  - Reading mode is quieter: only your pages, on soft colours from the app's own colours that move very slowly.
    Move the mouse to the top for Choose and ×. Double-click the clock to change it.
  - Zoom right out (Ctrl + wheel or the minus): every page of the book fills the screen as a grid - click a
    page, a document or a sub-book to go there. Zoom in again and you are back on the page you were reading.
  - When you go to another document, the page comes back to the middle of the screen.
  - Settings, Personalise, How BindLens works and the other windows can be moved and made smaller (they scroll).
  Reports you will really use
  - The list starts with the Essentials: People & contacts, Deadlines, Invoices & money, All tables to Excel,
    Find a word or a name, Everything about one person, My highlights & notes, Charts.
  - Invoices & money (new): one row per invoice or receipt - from whom, number, date, due date, total and VAT
    (the document's own total, never its lines added again), per month, per supplier, and what is overdue.
    Set a file's status to Paid and it no longer counts as overdue.
  - Form answers: ticked boxes are read (form fields and printed ☑ / ☐) and counted - how many forms ticked
    each box.
  - Since the last time: new rows are blue, and the rows that are gone are listed at the end in grey.
  - Money is written with its cents (€190.65). A date under a line that already has its own date is no longer
    taken as an expiry date. If a report fails in the background it is tried again and the reason is written
    in the error log.
  Safety
  - The PIN has 4 digits. Right-click a book > Lock this book with the PIN: it asks the PIN before it opens and stays out of
    searches and reports until you open it (Take the lock off this book to stop).
  - File > Copy with a password…: a copy of the file (or the book) that asks a password to open.
  More
  - Ctrl+E, change the line, then Shift+Enter: the change stays a mark - right-click it to edit it again, make
    it final or take it off. Enter changes the PDF's text for good, as before.
  - Scan and add: iPhone photos (HEIC) and pages photographed at an angle (made square again).
  - Right-click a page > Read aloud from here. Stop now always stops the voice.
  - Book icons: the Childcare and School groups are now one group, Education.

NEW IN 4.0
  Calmer and quicker
  - Fast mode (Personalise > Speed, or the bolt in the quick bar): nothing moves and nothing runs in the
    background unless you ask - on by itself on a laptop's battery if you like. Background work (Office copies,
    reading scanned pages) now waits until nobody uses the computer, at low priority.
  - Help > What BindLens is doing: Office copies (ready / waiting / why one failed), scanned pages read, saves
    waiting - with "Test Office" and Pause.
  - The calendar is a card of its own: drag it anywhere, minimal or glass, small to large, what it shows.
  - Big, realistic backgrounds made by BindLens: woods (light oak, walnut, dark desk, white-washed pine, birch,
    rustic), marble, linen, cork, leather, slate.
  - Clear up / down bars wherever books are listed; "Find a book" in the library.
  The quick bar and the frame
  - A slim column of icons on the right: Study, Read aloud, Edit the PDF's text, Scan and add, Highlights and
    notes here, Calendar (also Reminders, All pages, Deleted pages, The frame, Fast mode, What BindLens is
    doing). Some act at once, others open a slim panel that slides out (Esc or the icon closes it).
    Right-click the bar to choose what it shows; drag an icon to move it; View > Quick bar hides / shows it.
  - A thin frame round the window with colours flowing slowly. It glows while BindLens works, pulses when a
    report is ready, is calm while you read, rests while you scroll. The frame icon: flowing / still / off,
    colours (yours, aurora, ocean, sunset, forest, grey or your own three), speed, width, soft glow.
  New things you can do
  - Edit the PDF's own text (Ctrl+E): click a line, change a word, a date, a mistake - in the same font, size
    and colour (the font in the PDF, the same font on your computer, or the closest one). Ctrl+Z undoes it.
  - Scan and add (File menu / quick bar): from a scanner (Windows asks which), the computer's camera (take a
    photo of each page - they come in by themselves) or photos from your phone. Each page is cut out of the
    desk, turned straight, white paper made white; then added to the book as a new document or after the page
    you are on. Its text is read by itself, so you can search it.
  - Read aloud (Ctrl+U): the computer reads the page with its own voices - word by word on the page, pause,
    speed, voice, on to the next page. Select text first to hear only that. (More voices: Windows Settings >
    Time & language > Speech.) Offline, nothing to install.
  - Study (Ctrl+B): all your highlights and notes of a document or a book on one summary sheet (PDF or Word,
    by colour, with the page) - and cards to review: a note on a highlight is the question, a highlight alone
    becomes "fill the gap". Again / Hard / Good / Easy decides when it comes back (today, tomorrow, in 3 days…).
  Reports that read your tables properly
  - Each column is read by what it holds: the name, the email, the phone, dates, amounts - whatever its title
    says, wherever it is, even with no titles at all, and first name + surname in two columns. A value goes to
    the person with the same role ("Parent mobile" -> the parent, "Emergency phone" -> the emergency contact).
  - Names from email headers ("Mary Ryan" <mary@...>), from the address itself (mary.ryan@, m.ryan@,
    maryryan@), the heading above a table ("Contacts for Seán Ó Briain"), "Name: / Email:" forms (a label seen
    again = the next person). Office mailboxes (info@, accounts@) are not a person.
  - Every link says how it was found and how sure BindLens is (Sure / Check / Unsure, in colour). The same
    person written two ways (Seán Ó Briain / SEAN O'BRIAIN, M. Ryan / Mary Ryan) is one person.
  - Charts: one colour for what matters and grey for the rest, a sentence saying what each chart shows, bars
    sorted biggest first with "Other", a deadline timeline (late in orange-red, Today line), key words as bars
    with counts, "Needs attention" first, what was read on top.
  Also
  - File > Lock with a PIN (asked at start and after the resting screen; a recovery code if you forget it).
    Only on this computer: a BindLens zip you share carries no PIN, no books, no settings.
  - Updating: drop the new "BindLens x.y.zip" on the window (or Help > Update from a zip). The version before is
    kept: Help > Go back to the version before. A "What's new" window tells you what changed.

NEW IN 3.3
  - Word, PowerPoint and Excel inside BindLens, as they look: a presentation shows its slides, a Word document
    its pages, a workbook its sheets - like a PDF, no more card with the logo to double-click. Also the old
    .doc, .ppt and .xls. BindLens asks Microsoft Office on your computer (or the free LibreOffice), hidden and in
    the background, for a picture of every page - the file you are on first, then the rest of the book, then
    your other books, a few at a time, each program opened once for all of them. It uses a copy: your files are
    never changed, and it is done again only when a file changes. While a file is not ready, its page says
    "Getting it ready to show here"; right-click it > "Show it here as it looks (ask Office now)".
    If something goes wrong, a note says which file and why (and BindLens-error.log too).

NEW IN 3.2
  - Ticks and crosses: the Stamp button > "Ticks, crosses and quick marks" - ✓ tick, ✗ cross, ☑ ☒ ☐ boxes, dot,
    circle, ? and !, star, arrow, numbers 1-5 (small to very big, their own colours or yours). Or right-click the
    page > "Tick here" / "Cross here". Double-click a tick and it becomes a cross (a box: ☐ → ☑ → ☒).
    Right-click one > "Change to". Like every mark: move, resize, delete.
  - Up and down: the list of books and the column of book icons have a slim bar with ▲ ▼ (click or hold them,
    drag the bar). The index on the left: drag its bar, ▲ ▼ go faster when held, double-click ▲ / ▼ to jump to
    the start / the end.
  - The index of a long document: while you read through a folder, the chapters of the long document you are
    in come up softly under it in the folder's index (light, see-through), and go away when you leave it. A long
    document without chapters gets a little index by pages (Pages 1 - 10, 11 - 20…).
  - Safer white boxes: every copy that leaves BindLens - Send by email, Read-only copy, the book as one PDF,
    Save pages as a new PDF, split - has the text under the white boxes and brushes erased for good. Your own
    file keeps its boxes, removable as before.
  - Clocks and a calendar beside the page: new clocks (station clock, rings, time in words) and sizes. A calendar
    under the clock - or clock and calendar on the left (Personalise > Beside the page). Click a day: add a note
    or event (colour, a sign ★ ! ⚑ ✓ ☎…, time, once / every week / month / year) - they show as dots and in
    "Coming up"; today's notes are shown when you start. An announcement pinned on top ("Parents' evening
    Thursday"), until a date. Irish bank holidays, the dates BindLens found (expiring papers) and your reminders.
    Bring in calendars: a .ics file or a link from Outlook or Google (read again every hour - it needs the
    internet). Look (soft, bold, minimal), colour, week from Monday or Sunday, week numbers. Right-click the clock
    for everything. Save your notes as .ics for Outlook.
  - Big PDFs save at once: only the change is added to the file (a mark on a 200 MB scan is not a whole new
    file any more). When text is erased for good or a page is deleted, the whole file is written again so it is
    really gone.
  - Scanned documents are read by themselves, quietly in the background (the document you are in first): then
    search, Ctrl+K, selecting text, highlighting and reports work on them. The first time BindLens asks to fetch
    its English reading data (4 MB, once).
  - Word, Excel and PowerPoint exactly as they look - also old .doc, .xls, .ppt - when Microsoft Office or the
    free LibreOffice is on the computer: BindLens asks it, hidden and in the background, for an exact PDF copy,
    kept in its own folder (your files are never touched) and made again only when the file changes. Until then,
    or without Office, they show simply as before.

NEW IN 3.1
  - Every change can be taken back - so BindLens no longer makes copies of your documents. (The daily copies of
    3.0 are switched off; the copies already made stay, under "Earlier versions…", until you don't need them.)
  - Deleted pages are not lost: they go to Pages > "Deleted pages…" with a picture of each one - "Put it back"
    puts the page back where it was, any time (also after closing BindLens). "Delete for good" there if you wish.
  - Hide the PDF's own text: Eraser > "White box" (drag over the text) or "White brush" (paint over it - thin,
    medium or thick). Both are marks: click to move or resize, Delete and the text is back. Only when you choose
    "Erase the text under it for good" (right-click the white box - for private data) is the text really removed
    from the file - BindLens asks first. Shapes > "White box" does the same.
  - Shapes with colours and effects: Shapes > "Colours and effects…" (for new shapes) or "Style" on the bar while
    you type in one: fill colour, line colour and thickness, dashed or dotted line, see-through, gradient with two
    colours (top to bottom, left to right, corner to corner, from the middle), glossy shine, glow, 3D raised,
    soft shadow, small or big corners - and "Plain again".
  - A new logo to choose: Personalise > "Logo and resting screen" - Classic or New (a page with a bookmark, its
    pages behind it and the golden lens reading it). In the 4 colours, everywhere: top bar, window and taskbar
    icon, desktop shortcut, reports and the resting screen.
  - "Make this file smaller" now says clearly that it can't be undone once BindLens is closed.

NEW IN 3.0
  - Home (Ctrl+H, the house at the top): continue reading where you were, what needs you (expiring vetting,
    certificates, deadlines - click to open the page, "Add to my calendar"), your books, recent documents
    and the reports you made.
  - Ctrl+K finds everything: documents, words inside them AND actions ("print", "reports", "expiring",
    "smaller"…), shown as clear rows with their shortcut. Ctrl+/ shows every keyboard shortcut.
  - F4 (or the new grid button on the page bar): all the pages of the book as pictures - your marks and added
    pages shown - click one to go there. Small / Medium / Large.
  - Smoother scrolling (wheel and touchpad by small steps), zoom where the mouse is, Back / Forward (Alt+arrows).
  - Warm paper pages (easy on the eyes), dark title bars with dark themes, your colour always readable,
    no tiny writing, rounded notes with Undo.
  - Safer: a daily copy of each PDF before its first change (Earlier versions), marks never written over a
    file changed in another program (a copy is made), unsaved marks rescued at closing, a moved or deleted file
    is never made again, read-only files say so, password-protected PDFs stay protected, digitally signed PDFs
    (e.g. vetting disclosures) ask first - or keep your marks in a copy. Errors are written in
    BindLens-error.log and said, never silent.
  - Reports: "Hours from rotas" (8-4, 08:00-16:30, 9am-1pm, Start/Finish/Break - per day and in total);
    "Missing documents per person" now also shows what is EXPIRED or expiring for each person (the
    inspection checklist); renewed papers (an old vetting letter with a newer one) are no longer "expired";
    "Add to calendar" (.ics for Outlook) from any report with dates and from Reminders; the filter and
    order you see are what is saved and printed; Irish names (Seán Ó Briain) and accents found either way.
  - Pages > "Make this file smaller" (big scans and photos). New page templates: accident / incident report,
    medication record, sleep check, daily sign-in sheet, fire drill record.
  - Fixes: page ranges like "1 - 3" printed the whole document; the copies and odd/even of one print came back
    the next time; desktop.ini showed as a page; the page box (Ctrl+G) and form fields could vanish while typing;
    OneDrive "online only" files are no longer all downloaded for the search.

NEW IN 2.0
  - A moved folder now really opens: what BindLens knows about its files (their pages, their text for the
    search) moves with it - nothing has to be read again, so "Reading 0 of 10 files" no longer stays on the
    screen. Folders found by their name are found much faster too.
  - Opening a book never gets stuck: the count moves file by file; if Windows or OneDrive is slow to give a
    file (still downloading, "online only"), the card says which one and offers "Open now" - and after 40
    seconds the book opens by itself; those files appear as soon as they arrive.
  - The refresh arrow on a book really goes to its folders on your computer: every folder and sub-folder is
    read again (nothing from memory), new files are added, removed ones dropped, CHANGED ones (a rota edited in
    Excel or Word) read again - and a note always says what it found: "2 new, 1 changed · 3 folders read on
    your computer" or "up to date - 10 files". A moved folder is looked for first. F5 does it for all books.
  - The number on the Reports button = the reports you made lately (the last 8). They are at the top of the
    Reports window ("Made lately"): click one to make it again.
  - Reading mode: a new sky clock - the sky of the hour in a round window (blue by day, dawn and sunset
    colours, night with stars and the moon), the sun or the moon crossing it over two hills, the minutes as a
    ring of dots, the time and "Morning / Afternoon / Evening / Night". With the animation on: a little comet
    for the seconds, twinkling stars and a ripple at each new minute. Right-click the clock (or Personalise >
    Beside the page): Animation on / off - off, every clock is still and changes once a minute.

NEW IN 1.9.9
  - A book's folder that you MOVE (into another folder) or rename on your computer is followed: BindLens finds
    it by itself - near where it was, on the Desktop, in Documents, Downloads, OneDrive - and reads it from its
    new place. The book keeps its name, icon, colour, marks and places; a small note says where it was found.
    If it can't be found (or there are two folders with its name), the book shows "Find it…" - show BindLens
    where the folder is now - and "Look for it again". No more Remove and add again.
  - A little shelf above the map and above the contents in reading mode: the number of documents, the pages and
    how far you have read - each document a book on the shelf, as tall as its pages (the ones you have read in
    your colour, the one you are in bright). Click a book on the shelf to go there. A book that is one long
    document shows its parts (or its pages) on the shelf.
  - Backgrounds: the autumn leaves are bigger and look real - maple, oak, birch and golden ginkgo leaves, shaded,
    with veins, some with brown spots, turning as they fall - and maple seeds spinning like little helicopters.
    Butterflies, dandelion seeds and snow crystals are a little bigger too.

NEW IN 1.9.8
  - BindLens prints by itself - no PDF program, no browser. The printer button (or Ctrl+P) opens BindLens's print
    window: the printer (all your printers, also "Microsoft Print to PDF") and its own settings ("Printer
    settings…": paper, tray, quality); the pages - this page, pages like "1-3, 7", this document or the whole book,
    all / odd / even; copies, in order (1 2 3, 1 2 3) or not; the size on the paper - fit to the paper, actual
    size (100%) or any % (80%, 110%…); orientation (automatic turns landscape pages); colour or black & white;
    one side or both sides; with or without your marks. A picture of the sheet shows how it will come out, page
    by page, and how many sheets of paper it takes. While it prints a small bar shows how far it is (click it to
    stop).
  - Reports and charts print through the same window.

NEW IN 1.9.7
  - Print is easy to find: a printer button at the top, next to the ? (or Ctrl+P) - this page, some pages, the
    document or the whole book, with your marks.
  - Reports and charts can be printed too: "Print" in the report window (or Ctrl+P there) - it prints the new
    PDF look straight away.

NEW IN 1.9.6
  - Charts: a new group in Reports with one entry, "Charts gallery" - the Reports list stays as simple as it was.
    The gallery shows a little picture of each chart; click the ones you want, or "Pick for me" (BindLens keeps
    the ones your documents have data for). 21 charts in 6 groups:
      Money       amounts per month · this year against last year (running total) · who the money is with
                  (the few that make 80% stand out) · sizes of the amounts · largest amounts
      When        busy days (a calendar of the last 12 months) · days of the week · documents saved per month ·
                  how old the documents are
      Coming up   expired & expiring (days left or days since) · deadlines per month
      Who         people named most · who is in which document · organisations named most
      Documents   kinds of documents · size of the documents · books compared · status · my marks
      Words       key words · key words in each document
    Each chart has a line that says what it shows ("Sunny Days Creche Ltd alone is 94% of the total") and its
    numbers in a table at the end. Honest charts: bars start at zero, round numbers on the scale, one scale per
    chart, your accent colour for the data and grey for what is only there to compare.
  - The Reports list has a small picture next to each report and its group.
  - Report PDFs are new: calm and minimal, in your accent colour, with a good font (Segoe UI on Windows), the
    BindLens logo (in your logo colour) and the title on the first page, a fine frame round every page, the
    title and page number at the bottom of each page. Long tables repeat their column titles on every page.

NEW IN 1.9.5
  - New documents in your folders, once more made sure: when BindLens opens it reads the own folder of EVERY
    book again for real (not only the last one), a reading that was waiting for another one is never lost, and
    two readings can no longer get in each other's way.
  - Folders added as "one book per subfolder": the book with the folder's own files used to be a fixed list - a
    new document saved in that folder never appeared. Now that book reads the folder itself (only its own files);
    old books of this kind are changed by themselves.
  - Help > "Check my folders (a file is missing?)" - and right-click a book > "Check this book's folder": what is
    really in each folder and why a file is not in the book (a kind BindLens can't show, a file you removed from
    the book - "Put back the files I removed" -, a folder that was moved or is on a drive that isn't connected).
    New files it finds are added at once. The ↻ note "up to date" opens it too.

NEW IN 1.9.4
  - New documents appear by themselves: Windows now tells BindLens the moment a file is added, removed or
    renamed in a book's folder (also while BindLens is in the background), and when you open BindLens every
    book's folder is read again for real straight away - the book you were reading first. A small note next to
    the book's icon says what is new.
  - The parts of a document: for a big PDF (or Word, e-book…) BindLens finds its contents - from its bookmarks,
    from its contents page (any language: the lines that end with a page number) or from its headings. The map
    on the left shows the parts under the document you are reading ("Part 5 of 9"), marks the part you are in as
    you read, and a click takes you exactly to that page. In reading mode the contents show them too, and the
    bar at the top says which part you are in.
  - The BindLens icon in the taskbar and the window's title is alive: a golden light runs slowly round the logo.
    The desktop icon has the golden line too (Windows does not let desktop icons move). "The logo moves" in
    Personalise turns the light off.

NEW IN 1.9.3
  - The desktop icon always works: Install.bat copies BindLens to a place that never moves and makes the
    shortcut there (with the logo, also in the Start menu). The shortcut opens BindLens without a black window.
    If the shortcut ever points to a BindLens that was moved or deleted (for example a copy opened straight from
    the zip), BindLens repairs it by itself the next time it starts - and it makes one if there is none.
  - Books update by themselves: when you come back to BindLens, every book's folder is read again for real
    (Windows does not always say that a folder changed), also every 30 seconds while BindLens is open, and when
    you open a book. A small note next to the book's icon says what changed ("Centre: 2 new files"); click it
    to open that book. The ↻ on a book also shows a note ("up to date" or what is new).
  - Every kind of document can be in a book: Word, Excel and PowerPoint (also .docm, .xlsm …), PDF, pictures,
    text, and now also .csv (as a table), .rtf, .odt / .ods / .odp (LibreOffice), .eml (e-mails), .json, .xml.
    Files BindLens can't look inside (old .doc, .xls, .ppt, Outlook .msg …) appear as a card with their name,
    size and date - double-click it to open the file in Word, Excel…
  - Loose documents as books: the + under the book icons (and in the library) now asks "Add a folder" or "Add
    documents" - each document becomes a book of its own with its icon, colour and place (drag it to reorder,
    click its icon 3 times to personalise) - or "Add documents as one book". Drop files on the book icons to
    make them books (drop them on a book to put them in it).
  - The map of the book (left) and the contents in reading mode have round ▲ ▼ buttons (click, or hold) and a
    small pill that shows where you are - click the track to jump. The lists in "Choose what to read" have the
    same control.
  - Reports, "Look in": a new choice "Another book ▾" - look in any book (or a few), whichever book or document
    Reports was opened from.
  - The logo at the top left is bigger (a little bigger than a book's icon), the name smaller, and a thin golden
    line runs round the logo, slowly, all the time.
  - Resting screen: the night sky stays, and now the logo is put together: its pieces float among the stars
    like little files, the lens looks for them one by one and each piece flies to its place; when the logo is
    whole the lens takes its own place and a golden light runs round it - then the pieces scatter and the
    search starts again.

NEW IN 1.9.2
  - Pages you add (written pages, empty pages, pages from another PDF) show as a green band in the strip next to
    the scroll bar - point at it to see what and when, click it to go there.
  - Books: files added to a book's folder from outside (Explorer, a scanner, OneDrive…) now appear by themselves
    more reliably - and each book has a small ↻ (on its icon and in the list) to read its folder again at once.
  - The book icons are bigger, and you can DRAG them (on the left or in the list) to put the books in your order.
  - The desktop shortcut shows the BindLens logo (a new .ico that every Windows size can read), and the logo at
    the top left is a little bigger.
  - Pages show faster: the pages you were looking at are kept as pictures, so a book opens at once next time;
    while a page is being drawn it shows a calm page shape instead of plain white.
  - Reports - Extract data: reads form BOXES and form FIELDS and knows what they are by their label (Name, Email,
    Phone, Organisation - inside the box, on its left or above it); finds the person a value belongs to on forms;
    reads SCANNED pages too (OCR - tick "Read scanned pages too"; what it read is kept, so the next time is
    instant); and a filter: "Only if it contains…" and "Only the ones with a person". First name + Surname columns
    become one name.
  - New resting screen: a night sky where your books are constellations - the lens of the logo wanders among
    them and says their names - with shooting stars, the moon in its real phase and a big clock. (Personalise:
    "Night sky with your books" or "Logo in pieces".)

NEW IN 1.9.1
  - Read (the new button next to Reports, or F6): a quiet reading mode - only your pages, fitted to the
    window. On the left the contents of the book (like the first page of a book: numbered documents, page
    numbers, a ribbon, where you are and how far you have read - click one to go there); on the right a tear-off
    calendar and a ring clock (minutes and hours fill two rings), and your next deadline. It always starts at
    the first page of the first book of your library; "Choose what to read" (at the top) picks any book or
    document - or type its name. Esc (or Exit) brings everything back.
  - The ? button next to Settings (or F1): how BindLens works, in one short page - with the full guide (PDF).
  - A new Reports button: a deep pill in your accent colour with a little page whose chart grows.
  - Welcome folder: "BindLens Quick guide.pdf" - a 2-page guide for someone who has never used BindLens.

NEW IN 1.9
  - Reports, simpler: the button opens a list straight away (with a search box), in groups:
      Extract data   emails, names of people, phone numbers, addresses & postcodes, dates, amounts & prices,
                     IDs & reference numbers, companies & organisations, links - or everything at once
      Tables         rows as they look (with their column titles on top), rows to a table, columns as they
                     are, all tables to Excel, add up a column
      Find           a word, name or value · a document by its name
      Text analysis  word count & reading time · summary (key sentences, no AI) · most used words · at a glance
      Documents      overview · compare two · duplicates · my highlights & notes
      Dates          expired & expiring · timeline · trends & charts
      Data quality   same data in every document · same person, different details · quality check
    Choose one: only then a small panel asks what to include - e.g. for Emails just tick: the person it
    belongs to, the organisation, the document, the page, the whole line, how many times (or nothing: only
    the emails). "Your table:" shows the columns you will get. Asking in your own words is still there, at
    the bottom of the list.
  - Search: type part of a document's name in the search box - "week 38", "wk38", "invoce march" (it
    doesn't have to be exact) - and pick it from the list to open it. Or search the text, in this book or
    everywhere. Ctrl+K: Everything / Document names / Inside the documents.
  - Beside the page (when there is room): on the left a map of the whole book - its documents and
    sub-books, where you are and how far you have read; click one to go there. On the right a real clock
    (classic, digital or flip - click it to change), the date and your next deadline.
  - Behind the pages: new textures (paper, linen, wood, slate, parchment) and new moving things (rain on
    glass, aurora, and "the season": snow, petals, fireflies or leaves - it changes by itself).
  - Resting screen: a calm clock in the middle; the logo breaks into little pieces that fly to another
    corner and come together again.
  - Book icons: the column on the left is wider, with bigger icons. Click a book's icon 3 times to change
    its icon - and write your own text on it (up to 4: 2028, W38, HR) under the icon, on a folder, big, on a
    page or on a calendar.
  - A new, more colourful Reports button.

NEW IN 1.8
  - Reports, new: Ask your documents -> Extract exact data -> Analyse -> Report.
    Write what you want - "John Smith - date, amount, invoice number", "total amount per month",
    "hours per child", "invoices in March - invoice number, total" - and BindLens finds the exact data in
    your documents, adds it up if you asked, and shows it as a table and a chart. It shows what it understood
    while you type. No AI: only the exact data that is in your documents.
  - Or choose a report from one simple list (with a search box), in 7 groups: Document overview · Find &
    filter · Data extraction · Compare documents · Aggregated data · Trends & charts · Data quality.

NEW IN 1.7.2
  - Reports: only the 10 that matter, on one screen, with nothing to set but where to look (and a name or
    a column when the report needs one). You choose PDF, Word or Excel when you save it.
  - Rows as they look: each picture now always starts with the table's title and its column titles
    (Name, Date…) - even when the row is far below them or on a later page (a dotted line shows the jump).
  - New: Analysis - key numbers and charts of your documents (kinds of documents, key words, people named
    most, dates per month, pages per file).

NEW IN 1.7.1
  - Much faster with big folders, and the window never freezes ("Not responding" is gone):
    BindLens now reads your files with small invisible helpers, separate from the window. Opening a book,
    adding a folder with many sub-folders, searching, the search index, the Reports button and the reports
    themselves all happen there - the window only draws.
  - Big folder trees are remembered: they open at once the next time. New files you save in Explorer, Word,
    a scanner… appear by themselves when you come back to BindLens (F5 still reads everything again).

NEW IN 1.7
  - The text bar always closes (Done, Cancel or a click on the page). Windows close when you finish.
  - Rows exactly as they look: back to how they were, now with the title of each table (in the picture and
    in Word / Excel), and the rows of one table together in one picture.
  - Sub-books: any folder of your computer (Desktop, Documents, USB, OneDrive…) can be shown inside a book.
  - New books open at once, even with hundreds of files (no more "Not responding").
  - Moving backgrounds are light: they pause while you work, scroll or type, and when BindLens is not in front.
  - Photos in sticky notes: fill the space or show it whole, zoom, drag to choose the part, turn, frame.
  - Shapes you fill with colour and write in: box, rounded box, circle, diamond, hexagon, arrow, star, flag.
  - The page editor is like a simple Word: tabs, table styles, pictures you can resize, crop and put beside
    the text, page breaks, preview.
  - 120 smooth icons for your books: folders, letters, dates, work, people, school… with badges and 3 styles.
  - The Reports button shows how many things expired or expire soon.
  - The logo's lens looks around now and then - and after a while without touching anything, the logo comes
    alive in the middle of the window.

YOUR LIBRARY
  Each book reads ONE folder on your computer (Desktop, Documents, OneDrive...).
  - "+" next to Library (or drag a folder onto the window) adds a folder.
  - Add files: they are MOVED or COPIED into that book's folder (you choose -
    Settings > Adding files). They are real files in the real folder.
  - Sub-books = sub-folders. Right-click a book > "New sub-book…".
  - Right-click a book > "Add a folder from your computer as a sub-book…" (or drag a folder onto a book in the
    list): the folder stays where it is and shows inside the book (marked with a small arrow).
  - F2 (or right-click) renames a file - the real file on your computer.
  - Icons on the left: one per book. Right-click > "Icon and colour…": 120 icons in groups (folders, work,
    people, childcare & school, files, everyday), a search, folders with a letter or number, dates (year,
    month, quarter, week, school year, day), a badge (number, ✓, !, ★) and the style: 3D, flat or light.
  - BindLens opens where you left off (book, page, zoom).

MARKS - saved inside the original PDF (one file, no copies)
  Everything BindLens adds is LOCKED in other PDF readers (Edge, Acrobat…): they show it
  and print it, but can't edit it, and there is no red comment bubble. Only BindLens edits it.
  Select text: colour = highlight, U underline, S strike through, Note, Copy.
  Top bar:  select | pen · text · sticky note · shapes · stamp | eraser | colour | undo · redo | new page
    Shapes      The shapes button > "Fill with colour and write inside": box, rounded box, circle, diamond,
                hexagon, arrow, star, flag. Drag on the page and type. "Style" in its bar: white with a black
                line, yellow, blue… line width, shadow.
    Text        Click on the page and TYPE straight on it (drag first to choose the width).
                A bar above the text changes everything while you type: the look (22 looks:
                speech and thought bubbles, callout with arrow, ribbon banner, tag, card with
                shadow, quote, info / warning / tip / done boxes, marker swipe, gradient…),
                font (Handwriting, Script, Comic, Display, Elegant… when Windows has them),
                size, bold, italic, underline, strike, text colour, highlight, box colour,
                alignment, lists. "More…": tail of the bubble, round corners, shadow,
                see-through. Ctrl+Enter or click outside to finish, Esc to cancel.
    Sticky notes  Combine as you like: what holds it (push pin, tape, paper clip, magnet,
                nothing) + the paper (folded corner, curled up, lined, squared, torn top).
                Note colour AND text colour, bold / italic, alignment, and a PHOTO or picture
                inside (on top, on the left, or only the picture): the whole photo or filling the space, zoom,
                drag it in the preview to choose the part you want, turn it, white frame.
    Stamps      Approved, Paid, Done… - or your own in My stamps. Signature, picture or logo.
  Click a mark: drag to move it, drag its corner to resize, drag the ROUND HANDLE above it to
  turn it (5° steps, hold Shift for free), double-click to edit. Ctrl+Z / Ctrl+Y undo, redo.

PAGES - write your own pages (like a simple Word)
  The "page +" button (or Pages > Write a new page…): a page editor opens, with tabs:
  HOME (styles, font, size, bold…, colours, alignment, lists), INSERT (table - choose its size -, picture,
  line, page break, today's date, tick box, signature line), PAGE (paper, size, margins, columns, line
  spacing, page numbers), and TABLE or PICTURE when you are in a table or click a picture.
  - Tables: 6 styles (grid, lines, stripes, minimal, box, bold header), header row / first column, colours of
    the header, the lines and each cell, merge cells, alignment, drag the marks above a table for the column
    widths, table width and position, compact or roomy. Tab moves to the next cell.
  - Pictures: click one, drag its corner to change its size; left / centre / right; text beside it (on its
    right or left); crop, turn, border, caption, replace.
  - Preview (Ctrl+P) shows the real page. Ctrl+S saves and closes.
  - Start from: blank, notes, letter, meeting notes, to-do list, invoice, weekly planner,
    report cover, Cornell notes.
  - Styles (title, heading, subheading, quote, lists), fonts, sizes, bold / italic /
    underline, colours, highlight, alignment.
  - Insert a TABLE (type in the cells; right-click a cell: rows, columns, header, colours),
    a picture (right-click it for its size) or a line.
  - Page: paper (blank, lined, squared, dotted, Cornell, coloured), page colour, size,
    portrait / landscape, margins, 1-3 columns, header, footer, page numbers.
  - Long texts go on to more pages by themselves. The words are real PDF text (search and
    reports find them). Double-click a written page later to edit it again.
  Pages menu: empty pages, pages from another PDF, turn, move, delete, save pages as a PDF.

SHARE
  File > Print… · Send by email… · Read-only copy… · Save the whole book as one PDF…

PERSONALISE (click the logo)
  Themes, accent colour, app icon, and behind the pages:
  - gradients (12) - still, flowing colours, or a slow "lava lamp";
  - calm things moving: bubbles, clouds, waves, stars, soft lights, snow, petals, autumn
    leaves, fireflies (how many, how fast) - they rest while you work, so BindLens stays quick;
  - Photo gallery…: beautiful photos from the internet (Wikimedia Commons, Lorem Picsum) by
    topic - sea, mountains, forest, sunset… - or "Surprise me"; and MY PICTURES (yours).
  - textures: paper, linen, wood, slate, parchment; and rain on glass, aurora, the season;
  - Beside the page: a map of the book on the left, a clock (classic, digital, flip) with the date and the
    next deadline on the right - each can be turned off;
  - Logo and resting screen: the lens moves now and then (or a still logo); after 1, 2, 5 or 10 minutes
    without touching anything a clock shows and the logo breaks into pieces and comes together in another
    corner - move the mouse to go back.

READ
  The Read button (F6): only your pages, contents on the left, calendar and clock on the right. Starts at the
  first page of your first book; "Choose what to read" at the top; Esc to leave. The ? button (F1): a short guide.

FIND
  The search box: a document by its name (not exact: week 38, wk38) - or a word in this book / everywhere.
  Ctrl+F  this book        Ctrl+K  everything (Everything / Document names / Inside the documents)

REPORTS (Ctrl+R or the Reports button)
  A list opens straight away (type in its box to find one). Choose what you want - then tick only what to
  include, choose where to look (this document, this book, all my books) and Create report.
     Extract data    Emails · Names of people · Phone numbers · Addresses & postcodes · Dates · Amounts &
                     prices · IDs & reference numbers · Companies & organisations · Links · Everything at once
                     Include (tick): the person it belongs to · the organisation · the document · the page ·
                     the whole line · how many times · each one only once
     Tables          Rows as they look (a picture of each row with a name or value, with the table's title
                     and its column titles on top, even when they are far above or on an earlier page) ·
                     Rows to a table · Columns as they are (e.g. Phone, Hours) · All tables to Excel ·
                     Add up a column (sum, count, average… per person, month, document, supplier, a column)
     Find            A word, name or value · A document by its name (not exact: week 38, wk38)
     Text analysis   Word count & reading time · Summary - key sentences (3, 5 or 10 per document, and a
                     short summary of everything) · Most used words & phrases · Everything at a glance
     Documents       Document overview · Compare two documents · Duplicates · My highlights & notes
     Dates           Expired & expiring · Timeline · Trends & charts
     Data quality    Same data in every document · Same person, different details · Quality check
  At the bottom: "Or ask your documents in your own words…" - e.g.
       Mary Ryan - phone, email   ·   invoices - invoice number, date, total   ·   total amount per month
  You see the report first (double-click a row to open its page), then Save as PDF, Word or Excel, or Copy.
  The number on the Reports button = things that expired (in the last year) or expire in the next 30 days;
  right-click the button > "What needs attention" makes that report at once.
  Reports run on your computer - no AI, nothing is sent anywhere.

IF SOMETHING GOES WRONG
  BindLens writes BindLens-error.log in its folder. Run Install.bat to make the
  desktop shortcut again.
