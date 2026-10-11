# BindLens

**Your documents, bound into books.** BindLens turns the folders on your computer into books you can read,
search and mark - PDFs, Word, Excel, pictures and more - without copying or moving your files.

- Read every document of a folder as one book, with its contents and chapters.
- Highlight, underline, add notes, stamps and signatures - saved **inside your original PDFs**.
- Find anything across all your books, also in scanned pages (OCR).
- Reports from your documents: contacts, expiry dates, invoices, tables.
- Picture folders become galleries; videos play inside BindLens (big, full screen or in a corner).
- Home shows your books on a turning circle, in a bookcase, a filing cabinet, lockers...
- A 4-digit PIN to lock BindLens, and single books.
- Print, scan from your phone or scanner, write new pages and new documents; correct scanned pages.

Website: **[ckmohammed.github.io/BindLens](https://ckmohammed.github.io/BindLens/)** (the `docs` folder).

## Download (Windows)

Go to **[Releases](https://github.com/CKMohammed/BindLens/releases/latest)**, download
**`BindLens.Setup.exe`** (BindLens 1.0) and run it. No administrator rights and no Python needed.

Windows may say *"Windows protected your PC"* because the installer is not signed yet:
click **More info > Run anyway**.

## Privacy

BindLens has no account and sends nothing anywhere. It uses the internet only when you ask it to (a photo from
the internet, a calendar link, the data to read scanned pages). See [PRIVACY.txt](PRIVACY.txt).

## Licence

Copyright (C) 2026 Mohammed Chahboune Kadi.

BindLens is free software: you can use, study, share and change it under the terms of the
**GNU Affero General Public License v3** ([LICENSE.txt](LICENSE.txt)). It comes with no warranty.
The name "BindLens" and its logo are not licensed as trademarks. Third-party parts and their licences
(PyMuPDF / MuPDF by Artifex, Python, Tcl/Tk, VLC's libVLC and python-vlc, tkinterdnd2, Tesseract data):
[NOTICE.txt](NOTICE.txt). Under section 7 of the licence, the author's name on Home's frame must be kept.

## Run from the source

BindLens is one Python file, `BindLens.pyw` (Python 3.10 or newer):

```
pip install pymupdf tkinterdnd2 python-vlc
python BindLens.pyw
```

The Windows installer is built by GitHub Actions ([build-windows.yml](.github/workflows/build-windows.yml)) with
PyInstaller and Inno Setup ([installer/BindLens.iss](installer/BindLens.iss)).
