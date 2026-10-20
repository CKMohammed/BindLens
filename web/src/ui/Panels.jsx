// The panel that is open (Find, Reports, What needs you, Settings...).
import { lazy, Suspense } from "preact/compat";
import { panel } from "../state.js";
import { Find } from "./Find.jsx";
import { Dialog } from "./dialogs.jsx";

const Reports = lazy(() => import("./Reports.jsx").then(m => ({ default: m.Reports })));
const Dates = lazy(() => import("./Dates.jsx").then(m => ({ default: m.Dates })));
const Settings = lazy(() => import("./Settings.jsx").then(m => ({ default: m.Settings })));
const Help = lazy(() => import("./Settings.jsx").then(m => ({ default: m.Help })));
const Pin = lazy(() => import("./Settings.jsx").then(m => ({ default: m.Pin })));
const Write = lazy(() => import("./Write.jsx").then(m => ({ default: m.Write })));
const Scan = lazy(() => import("./Scan.jsx").then(m => ({ default: m.Scan })));
const Gallery = lazy(() => import("./Gallery.jsx").then(m => ({ default: m.Gallery })));
const Print = lazy(() => import("./Print.jsx").then(m => ({ default: m.Print })));
const Signature = lazy(() => import("./Signature.jsx").then(m => ({ default: m.Signature })));
const Pages = lazy(() => import("./Pages.jsx").then(m => ({ default: m.Pages })));
const Study = lazy(() => import("./Study.jsx").then(m => ({ default: m.Study })));
const BookPin = lazy(() => import("./BookPin.jsx").then(m => ({ default: m.BookPin })));
const Versions = lazy(() => import("./FileTools.jsx").then(m => ({ default: m.Versions })));
const Deleted = lazy(() => import("./FileTools.jsx").then(m => ({ default: m.Deleted })));
const Protect = lazy(() => import("./FileTools.jsx").then(m => ({ default: m.Protect })));
const Welcome = lazy(() => import("./Welcome.jsx").then(m => ({ default: m.Welcome })));
const Legal = lazy(() => import("./Welcome.jsx").then(m => ({ default: m.Legal })));
const FirstRun = lazy(() => import("./FirstRun.jsx").then(m => ({ default: m.FirstRun })));
const BookStyle = lazy(() => import("./BookStyle.jsx").then(m => ({ default: m.BookStyle })));
const AddPages = lazy(() => import("./AddPages.jsx").then(m => ({ default: m.AddPages })));
const Templates = lazy(() => import("./Templates.jsx").then(m => ({ default: m.Templates })));
const Tasks = lazy(() => import("./Tasks.jsx").then(m => ({ default: m.Tasks })));
const Share = lazy(() => import("./Share.jsx").then(m => ({ default: m.Share })));
const Keys = lazy(() => import("./Extras.jsx").then(m => ({ default: m.Keys })));
const Feedback = lazy(() => import("./Extras.jsx").then(m => ({ default: m.Feedback })));
const QuickBarChoose = lazy(() => import("./FrameBar.jsx").then(m => ({ default: m.QuickBarChoose })));

const MAP = { reports: Reports, dates: Dates, settings: Settings, help: Help, pin: Pin, write: Write, scan: Scan,
  gallery: Gallery, print: Print, signature: Signature, pages: Pages, study: Study, bookpin: BookPin,
  versions: Versions, deleted: Deleted, protect: Protect, welcome: Welcome, firstrun: FirstRun, legal: Legal, bookstyle: BookStyle,
  addpages: AddPages, templates: Templates, tasks: Tasks, share: Share, keys: Keys, feedback: Feedback, quickbar: QuickBarChoose };

function Loading() {
  return <Dialog title={null}><div class="spinner" /></Dialog>;
}

export function Panels() {
  const p = panel.value;
  if (!p) return null;
  if (p.type === "find") return <Find />;
  const C = MAP[p.type];
  if (!C) return null;
  return <Suspense fallback={<Loading />}><C {...p} /></Suspense>;
}
