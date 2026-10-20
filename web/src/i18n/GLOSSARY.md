# BindLens — glosario / glossary

The same word for the same thing, everywhere (web and Windows app). Spanish uses *tú*, short sentences,
Spain spelling (ordenador, móvil) and «» round names of books and files.

| English | Español | Note |
|---|---|---|
| book | libro | a folder of the Drive |
| sub-book | sublibro | a folder inside a book |
| library | biblioteca | all the books |
| shelf | estante | a named row of books on Home |
| document | documento | |
| file | archivo | |
| page | página | |
| mark (noun) / to mark | marca / marcar | highlights, notes, stamps… on a PDF |
| highlight / highlighter | resaltado, resaltar / resaltador | |
| pen | bolígrafo | |
| sticky note | nota adhesiva | |
| note | nota | |
| comment | comentario | |
| stamp | sello | |
| signature / sign | firma / firmar | |
| tick / cross | visto / cruz | ✓ / ✗ |
| eraser | goma | |
| white box / white brush | recuadro blanco / pincel blanco | |
| erase for good | borrar para siempre | redaction |
| crop | recortar | |
| change the text | cambiar el texto | edit the PDF's own words |
| status: Pending, Checked, Signed, Done, Urgent, Waiting | Pendiente, Revisado, Firmado, Hecho, Urgente, En espera | kept in English in the library, shown translated |
| checklist (of a book) | requisitos | the documents a book needs |
| task | tarea | |
| reminder | recordatorio | |
| countdown | cuenta atrás | |
| What needs you | Requiere atención | dates and tasks that need the person |
| report | informe | |
| reading mode | modo lectura | |
| read aloud | leer en voz alta | |
| contents | índice | |
| study cards | tarjetas de estudio | |
| template | plantilla | |
| scan | escanear / escaneo | |
| write (a page) | escribir | |
| frame | marco | the colours round the window |
| quick bar | barra rápida | icons on the right of the frame |
| Home | Inicio | |
| Find / Find anything | Buscar / Buscar cualquier cosa | |
| Settings | Ajustes | |
| Help | Ayuda | |
| Add | Añadir | |
| Undo / Redo | Deshacer / Rehacer | |
| bin | papelera | |
| My Drive | Mi unidad | Google's own Spanish name |
| sign in / sign out | iniciar sesión / cerrar sesión | |
| offline | sin conexión | |
| colleague | compañero | |
| institution | institución | |
| case file | expediente | |
| tabs: Read, Mark, Edit, Fill & Sign, Pages, Review | Leer, Marcar, Editar, Rellenar y firmar, Páginas, Revisar | |

How it works in the web app: every text goes through `_t("English")` (`src/i18n.js`); `src/i18n/es.js` has the Spanish.
Plurals: `_n(n, "{0} file", "{0} files")`. A key with `@@something` only separates two Spanish words that are the same in
English (`"{0} new@@one"`). Values kept in English in the library (statuses) are shown with `_tv(value)`.
