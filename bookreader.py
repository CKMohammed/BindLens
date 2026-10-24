# BookReader - the reading app made from BindLens's engine: its own start, screens and tools.
# Copyright (C) 2026 Mohammed Chahboune Kadi - free software under the GNU AGPL v3 (see LICENSE.txt).
# BindLens.pyw loads this file and adds these parts to its window (App); they use BindLens's own names.


class BookReaderParts:
    """BookReader's own parts of the window: start, folders, the icons and their bands, find, light, the eraser,
    the resting screen, the PIN screen. (Only BookReader uses them; BindLens never calls them.)"""

    def _lite_start(self):
        _log(f"BookReader: its own memory in {data_dir()}")
        for k_ in ("<Control-k>", "<Control-K>", "<Control-comma>", "<Control-e>", "<Control-E>", "<Control-h>", "<Control-H>"):
            try:
                self.root.unbind(k_)                     # BookReader: none of BindLens's tools and windows
            except Exception:
                pass
        try:
            self.files_tree.bind("<ButtonRelease-1>", lambda e: self.root.after(200, self._lite_read), add="+")
        except Exception:
            pass
        threading.Thread(target=self._lite_update_check, daemon=True).start()
        self.topband.bind("<B1-Motion>", self._lite_drag_move, add="+")     # the icons can be dragged
        self.topband.bind("<ButtonRelease-1>", self._lite_drag_up, add="+")
        self.root.bind("<Control-f>", lambda e: (self._lite_find(), "break")[1])      # find as in a PDF
        self.root.bind("<Control-F>", lambda e: (self._lite_find(), "break")[1])
        self.root.bind("<F3>", lambda e: self.search_step(1))
        self.root.bind("<Shift-F3>", lambda e: self.search_step(-1))
        for w_ in ("rail", "rail_sep", "add_btn", "seg"):
            try:
                getattr(self, w_).pack_forget()
            except Exception:
                try:
                    getattr(self, w_).grid_remove()
                except Exception:
                    pass

        if not self.lib.settings.get("lite_side_v2"):     # the library opens with its icon (its pin keeps it)
            self.lib.settings["lite_side_v2"] = True
            self.side_pinned = False
            self.lib.settings["side_pinned"] = False
            self.lib.save_meta()
            self._place_side()
        self._frame_layout()
        pick_ = {it[0]: it for _g, _c, its in App.REPORT_MENU for it in its}
        ex_ = ("exact", "Only the name exactly as I write it (not Mohamed for Mohammed)", False)
        lite_ = [pick_["snapshot"][:1] + ("A name's rows, as they look", "Each row with the name - a picture of the "
                                          "row exactly as it is, in this document, this book or all of them")
                 + pick_["snapshot"][3:4] + ([ex_, ("header", "Column titles on top", True)],) + pick_["snapshot"][5:],
                 ("find", "Find a name or a word", "Every page, row and line where it appears - how many times and "
                                                   "in which document", "names",
                  [ex_], "search look for where name person people word"),
                 pick_["columns"], pick_["tables"], pick_["marks"]]
        self.REPORT_MENU = [("", "#6C63FF", lite_)]
        try:
            self.lib_count.configure(text="")
        except Exception:
            pass
        rec = [x for x in self.lib.settings.get("recent_docs", []) if x.get("f") in self.lib.folders]
        if rec:
            self.root.after(300, lambda: self._go_doc(rec[0]["f"], rec[0]["rel"], rec[0].get("p", 0)))   # where you left off
        elif self.lib.folders:
            self.open_folder(next(iter(self.lib.folders)))
        else:
            self.set_status(_tr("Add your first folder."))
            self.root.after(700, self._lite_add)         # the first time, in one step: choose your first folder

    def _lite_add(self):
        before = set(self.lib.folders)
        self.import_folder()
        new = [f for f in self.lib.folders if f not in before]
        if new:
            if getattr(self, "_reading", False):
                self._read_open(new[0], "", None)
            else:
                self.open_folder(new[0])


    def _lite_light(self):
        """The light of reading: white page, warm paper, night - one icon, round and round."""
        st = self.lib.settings
        cur = "night" if st.get("night_pages") else ("warm" if st.get("warm_pages") else "white")
        nxt = {"white": "warm", "warm": "night", "night": "white"}[cur]
        st["night_pages"], st["warm_pages"] = nxt == "night", nxt == "warm"
        try:
            self._read_conf()["page"] = "same"
        except Exception:
            pass
        self.lib.save_meta()
        try:
            self.cache.clear()
        except Exception:
            pass
        self.redraw()
        self._toast({"white": _tr("White page"), "warm": _tr("Warm paper"), "night": _tr("Night")}[nxt])

    def _lite_find(self):
        """BookReader: find a word as Ctrl+F in a PDF - Enter (or ↓) the next one, Shift+Enter (or ↑) the one
        before, "3 / 12"; "All documents" looks in the whole library."""
        fb = getattr(self, "_lfb", None)
        if fb is not None and fb.winfo_exists():
            self._lfb_en.focus_set()
            self._lfb_en.select_range(0, "end")
            return
        T = self.T
        fb = tk.Frame(self.root, bg=T["panel"], highlightthickness=1, highlightbackground=T["border"], bd=0)
        self._lfb = fb
        v = tk.StringVar(value=getattr(self, "search_query", "") or "")
        draw_ = tk.Canvas(fb, width=20, height=20, bg=T["panel"], highlightthickness=0)
        draw_icon(draw_, "search", 11, 10, T["muted"], s=0.5, w=1.4)
        draw_.pack(side="left", padx=(8, 0))
        en = tk.Entry(fb, textvariable=v, width=22, font=self.F(10), relief="flat", bd=0, bg=T["panel"], fg=T["text"],
                      insertbackground=T["text"])
        en.pack(side="left", padx=(6, 6), pady=7)
        self._lfb_en = en
        cnt = tk.Label(fb, text="", font=self.F(8), bg=T["panel"], fg=T["muted"], width=8)
        cnt.pack(side="left")
        self._lfb_cnt = cnt

        def go(d=1):
            q = v.get().strip()
            if not q:
                return
            if q != (getattr(self, "search_query", None) or "") or not self.hits:
                self.start_search(q)
            else:
                self.search_step(d)
            en.after(30, en.focus_set)

        def close():
            try:
                self.clear_search()
            except Exception:
                pass
            self._lfb_cnt = None
            self._lfb = None
            fb.destroy()
            self.canvas.focus_set()

        def btn(txt, fn):
            b_ = tk.Label(fb, text=txt, font=self.F(11), bg=T["panel"], fg=T["text"], cursor="hand2", padx=5)
            b_.pack(side="left")
            b_.bind("<Button-1>", lambda e: fn())
        btn("↑", lambda: go(-1))
        btn("↓", lambda: go(1))
        al_ = tk.Label(fb, text=_tr("All documents"), font=self.F(8, "underline"), bg=T["panel"], fg=T["muted"],
                       cursor="hand2")
        al_.pack(side="left", padx=(6, 2))
        al_.bind("<Button-1>", lambda e: (lambda q_: (close(), self.quick_search(q_ or None)))(v.get().strip()))
        btn("×", close)
        for k_, d_ in (("<Return>", 1), ("<KP_Enter>", 1), ("<Down>", 1), ("<Shift-Return>", -1), ("<Up>", -1)):
            en.bind(k_, lambda e, d_=d_: (go(d_), "break")[1])
        en.bind("<Escape>", lambda e: close())
        fb.place(in_=self.view, relx=1.0, x=-14, y=10, anchor="ne")
        fb.lift()
        en.focus_set()
        en.select_range(0, "end")

    def _lite_lib(self):
        """BookReader: the whole library at the left - its icon opens it; its pin keeps it open."""
        if self.sidebar_visible:                           # kept open: the icon puts it away
            self.toggle_sidebar()
            return
        if self._side_overlay:
            return self._lite_lib_close()
        self.side.place(in_=self.paned, x=0, y=0, width=290, relheight=1)
        self.side_sep.place(in_=self.paned, x=290, y=0, width=1, relheight=1)
        self.side.lift()
        self.side_sep.lift()
        self._side_overlay = True
        st = {"in": False}

        def check():
            if not self._side_overlay:
                return
            px, py = self.root.winfo_pointerxy()
            busy = self._menu_open or self.root.grab_current() is not None
            if self._inside(self.side, px, py, 4):
                st["in"] = True
            elif st["in"] and not busy and not self._inside(self.topband, px, py):
                return self._lite_lib_close()
            self.root.after(400, check)
        self.root.after(400, check)
        self._topband_draw()

    def _lite_soft(self):
        """BookReader's quiet colours: the institution's (or the app's), very light."""
        cols = [c_ for c_ in (_BRAND.get("colors") or []) if c_] or [self.accent, "#E0A82E"]
        return cols + cols[:1] if len(cols) == 1 else cols

    def _lava_make(self, c, cols, n=4, light=0.6):
        """Soft blobs in the institution's colours that flow slowly, like a lava lamp (behind everything)."""
        rnd = random.Random()
        out = []
        for i in range(n):
            it = c.create_polygon(0, 0, 0, 0, 0, 0, smooth=True, fill=mix(cols[i % len(cols)], "#FFFFFF", light),
                                  outline="", tags=("lava",))
            out.append({"it": it, "ph": rnd.uniform(0, 6.28), "sx": rnd.uniform(0.10, 0.2), "sy": rnd.uniform(0.08, 0.16),
                        "r": rnd.uniform(0.18, 0.28), "cx": 0.15 + 0.7 * (i + 0.5) / n, "cy": rnd.uniform(0.3, 0.7),
                        "w": [rnd.uniform(0, 6.28) for _ in range(8)]})
        return out

    def _lava_step(self, c, blobs, t):
        W, H = max(50, c.winfo_width()), max(50, c.winfo_height())
        R = (W + H) / 2.0
        for b in blobs:
            cx = W * (b["cx"] + 0.18 * math.sin(t * b["sx"] + b["ph"]))
            cy = H * (b["cy"] + 0.22 * math.cos(t * b["sy"] + b["ph"] * 1.3))
            r = R * b["r"]
            pts = []
            for k in range(8):
                a_ = k * math.pi / 4 + t * 0.04
                rr = r * (1 + 0.17 * math.sin(t * 0.6 + b["w"][k]))
                pts += [cx + rr * math.cos(a_), cy + rr * 0.86 * math.sin(a_)]
            c.coords(b["it"], *pts)

    def _idle_start_lite(self, force=False):
        """BookReader resting (after 2 minutes): the frame flowing in your institution's colours, its logo, soft
        colours moving like lava, the time in thin figures, the date - and one of your highlights now and then."""
        if getattr(self, "_idle_win", None) is not None:
            return
        cols = self._lite_soft()
        ink = "#2B2B33"
        c = tk.Canvas(self.root, highlightthickness=0, bd=0, bg=mix(cols[0], "#FFFFFF", 0.9))
        c.place(x=0, y=0, relwidth=1, relheight=1)
        c.tk.call("raise", c._w)
        self._idle_win = c
        self._idle_since = time.time()
        blobs = self._lava_make(c, cols, 4, 0.7)
        segs = [c.create_rectangle(0, 0, 0, 0, outline="", width=0) for _ in range(96)]
        logo = self._pic_brand(72) or self._pic_br(72)
        it_logo = c.create_image(0, 0, image=logo) if logo is not None else None
        it_name = c.create_text(0, 0, text=_BRAND.get("name", ""), font=(self.family, 11), fill=mix(ink, "#FFFFFF", 0.3))
        it_time = c.create_image(0, 0)
        it_date = c.create_text(0, 0, text="", font=(self.family, 13), fill=mix(ink, "#FFFFFF", 0.3))
        it_q = c.create_text(0, 0, text="", justify="center", font=(self.family, 12, "italic"), fill=mix(ink, "#FFFFFF", 0.3))
        quotes = [m_.get("text", "") for ms_ in (getattr(self, "marks_by_g", None) or {}).values() for m_ in ms_
                  if m_.get("kind") == "Highlight" and 18 <= len(m_.get("text", "")) <= 240]
        random.shuffle(quotes)
        es_ = app_lang() == "es"
        days = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo") if es_ else \
            ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
        months = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
                  "noviembre", "diciembre") if es_ else ("January", "February", "March", "April", "May", "June", "July",
                                                         "August", "September", "October", "November", "December")
        st = {"sz": None, "min": None, "q": None}
        fw = max(5, min(12, int(self._frame_conf().get("width", 6))))

        def cyc(p_):
            p_ = (p_ % 1.0) * len(cols)
            i_ = int(p_)
            return mix(cols[i_ % len(cols)], cols[(i_ + 1) % len(cols)], p_ - i_)

        def layout(W, H):
            n_ = len(segs) // 4
            for i_, it in enumerate(segs):           # the frame: 4 sides, each in pieces that change colour
                side, k_ = divmod(i_, n_)
                if side == 0:
                    c.coords(it, W * k_ / n_, 0, W * (k_ + 1) / n_ + 1, fw)
                elif side == 1:
                    c.coords(it, W - fw, H * k_ / n_, W, H * (k_ + 1) / n_ + 1)
                elif side == 2:
                    c.coords(it, W - W * (k_ + 1) / n_, H - fw, W - W * k_ / n_ + 1, H)
                else:
                    c.coords(it, 0, H - H * (k_ + 1) / n_, fw, H - H * k_ / n_ + 1)
            if it_logo is not None:
                c.coords(it_logo, W / 2, H / 2 - 150)
            c.coords(it_name, W / 2, H / 2 - 98)
            c.coords(it_time, W / 2, H / 2 - 20)
            c.coords(it_date, W / 2, H / 2 + 44)
            c.coords(it_q, W / 2, H * 0.8)
            c.itemconfigure(it_q, width=min(620, W - 80))
            st["min"] = None

        def step():
            if getattr(self, "_idle_win", None) is not c:
                return
            try:
                W, H = max(300, c.winfo_width()), max(200, c.winfo_height())
                t = time.time() - self._idle_since
                if (W, H) != st["sz"]:
                    st["sz"] = (W, H)
                    layout(W, H)
                self._lava_step(c, blobs, t)
                for i_, it in enumerate(segs):
                    c.itemconfigure(it, fill=cyc(i_ / float(len(segs)) - t * 0.025))
                now = time.localtime()
                m_ = time.strftime("%H:%M", now)
                if m_ != st["min"]:
                    st["min"] = m_
                    big = self._text_img(m_, 84, ink, style="sans_l")
                    self._idle_imgs = [big[0]]
                    c.itemconfigure(it_time, image=big[0])
                    c.itemconfigure(it_date, text=f"{days[now.tm_wday]}, {now.tm_mday} {months[now.tm_mon - 1]}")
                if quotes:
                    q_ = quotes[int(t // 40) % len(quotes)]
                    if q_ != st["q"]:
                        st["q"] = q_
                        c.itemconfigure(it_q, text="“" + q_ + "”")
            except Exception as ex:
                _log(f"bookreader rest: {ex}")
            self._idle_job = self.root.after(90, step)
        step()

    def _lock_show_lite(self, cur):
        """BookReader's PIN: a light plain screen, a small thin lock, the time, a dot for each figure."""
        cols = self._lite_soft()
        bgc = mix(cols[0], "#FFFFFF", 0.9)
        ink, sub = "#2B2B33", "#7A7A85"
        ov = tk.Frame(self.root, bg=bgc)
        self._lock = ov
        st = self._lock_st = {"hidden": [], "job": None, "v": "", "msg": "", "busy": False}
        self._lock_place()
        ov.lift()
        self.__dict__.setdefault("_after_unlock", [])
        c = tk.Canvas(ov, bg=bgc, highlightthickness=0, bd=0, cursor="arrow")
        c.pack(fill="both", expand=True)
        n = int(cur.get("n", 4) or 4)
        blobs = self._lava_make(c, cols, 5, 0.5)
        t0 = time.time()

        def flow():                                      # the colours keep moving, slowly
            if getattr(self, "_lock", None) is not ov:
                return
            try:
                self._lava_step(c, blobs, time.time() - t0)
            except Exception:
                return
            self.root.after(80, flow)

        def draw():
            if getattr(self, "_lock", None) is not ov:
                return
            c.delete("ui")
            W, H = max(300, c.winfo_width()), max(260, c.winfo_height())
            cy = H / 2 - 70
            draw_icon(c, "lock", W / 2, cy - 74, ink, s=1.0, w=1.4, tag="ui")
            st["keys"] = []
            for i_, ch in enumerate("123456789 0⌫"):           # the figures, very quiet - click them
                if ch == " ":
                    continue
                r_, c_ = divmod(i_, 3)
                kx, ky = W / 2 + (c_ - 1) * 42, cy + 108 + r_ * 30
                c.create_text(kx, ky, text=ch, font=(self.family, 11), fill=mix(ink, bgc, 0.5), tags=("ui",))
                st["keys"].append((kx, ky, ch))
            big = self._text_img(time.strftime("%H:%M"), 46, ink, style="sans_l")
            st["img"] = big[0]
            c.create_image(W / 2, cy - 18, image=big[0], tags=("ui",))
            k_ = max(n, len(st["v"]))
            for i in range(k_):
                x_ = W / 2 + (i - (k_ - 1) / 2.0) * 22
                on_ = i < len(st["v"])
                c.create_oval(x_ - 5, cy + 36, x_ + 5, cy + 46, outline=ink, width=1.2, fill=ink if on_ else "",
                              tags=("ui",))
            c.create_text(W / 2, cy + 74, text=_tr(st["msg"] or "Type your PIN"), font=(self.family, 9), fill=ink,
                          tags=("ui",))
            c.create_text(W / 2, H - 30, text=_tr("Forgot it?"), font=(self.family, 8, "underline"), fill=ink,
                          tags=("ui", "forgot"))
            c.tag_bind("forgot", "<Button-1>", lambda e: forgot())

        def tick():
            if getattr(self, "_lock", None) is not ov:
                return
            if not st["busy"]:
                draw()
            st["job"] = self.root.after(15000, tick)

        def check():
            d = pin_load() or {}
            now = time.time()
            if now < float(d.get("until", 0)):
                st["msg"], st["v"] = "Too many tries - wait a minute.", ""
                return draw()
            val, st["busy"] = st["v"], True

            def work():
                try:
                    st["res"] = bool(d.get("hash")) and pin_hash(val, d.get("salt", "00")) == d.get("hash")
                except Exception:
                    st["res"] = False
                self.root.after(0, lambda: answer(st["res"]))
            threading.Thread(target=work, daemon=True).start()

        def answer(ok):
            st["busy"] = False
            if getattr(self, "_lock", None) is not ov:
                return
            d = pin_load() or {}
            if ok:
                d["fails"], d["until"] = 0, 0
                pin_save(d)
                return self._lock_hide()
            d["fails"] = int(d.get("fails", 0)) + 1
            if d["fails"] >= 5:
                d["until"], d["fails"] = time.time() + 60, 0
                st["msg"] = "Too many tries - wait a minute."
            else:
                st["msg"] = "Not right - try again."
            pin_save(d)
            st["v"] = ""
            draw()

        def forgot():
            code = simpledialog.askstring("BookReader", _tr("Your recovery code (the one you saved when you chose the PIN):"),
                                          parent=self.root)
            if not code:
                return
            d = pin_load() or {}
            if d.get("rhash") and pin_hash(code.strip().replace("-", "").upper(), d.get("rsalt", "00")) == d["rhash"]:
                self._lock_hide()
                self.root.after(300, self.pin_settings)
            else:
                st["msg"] = "That code is not right."
                draw()

        def key(e):
            if getattr(self, "_lock", None) is not ov or st["busy"]:
                return "break"
            if e.keysym == "BackSpace":
                st["v"] = st["v"][:-1]
            elif e.keysym in ("Return", "KP_Enter"):
                if st["v"]:
                    check()
                return "break"
            elif e.char and e.char.isprintable() and len(st["v"]) < 12:
                st["v"] += e.char
                st["msg"] = ""
            draw()
            if len(st["v"]) == n:
                self.root.after(150, check)
            return "break"
        self.root.bind("<Key>", key)
        c.bind("<Configure>", lambda e: draw())
        def click(e):
            c.focus_set()
            k_ = next((ch for kx, ky, ch in st.get("keys", []) if abs(e.x - kx) <= 18 and abs(e.y - ky) <= 13), None)
            if k_ is None or st["busy"] or getattr(self, "_lock", None) is not ov:
                return
            if k_ == "⌫":
                st["v"] = st["v"][:-1]
            elif len(st["v"]) < 12:
                st["v"] += k_
                st["msg"] = ""
            draw()
            if len(st["v"]) == n:
                self.root.after(150, check)
        c.bind("<Button-1>", click)
        c.focus_set()
        tick()
        flow()

    # ---- BookReader: the icons - at the top or on the left band, where you drag them
    LITE_TOP = ["_lib", "_choose", "_find", "_hl", "_note", "_erase", "_print", "_reports"]
    LITE_SIDE = ["_light", "_marks", "_cal"]
    LITE_ICONS = {"_lib": "sidebar", "_choose": "folders", "_find": "search", "_hl": "highlighter", "_note": "note",
                  "_erase": "eraser", "_reports": "report", "_print": "printer", "_light": "sun", "_read": "openbook", "_marks": "star",
                  "_cal": "calendar"}

    def _lite_keys(self):
        """(top band - left, the band with the logo, top band - right): where you put each icon."""
        st = self.lib.settings
        allk = self.LITE_TOP + self.LITE_SIDE
        side = [k for k in st.get("lite_side", self.LITE_SIDE) if k in allk]
        right = [k for k in st.get("lite_topr", []) if k in allk and k not in side]
        top = [k for k in st.get("lite_top", self.LITE_TOP) if k in allk and k not in side and k not in right]
        top += [k for k in allk if k not in top and k not in side and k not in right]
        return top, side, right

    def _lite_show(self, k):
        """The light while reading; Read (the open book) when not reading - one place for both."""
        return k

    @staticmethod
    def _lite_slot(k):
        return "_light" if k == "_read" else k

    def _lite_lit(self, k):
        return (k == "_hl" and getattr(self, "_lite_hl", False)) or (k == "_note" and self.tool == "note") or \
            (k == "_erase" and getattr(self, "_lite_er", False)) or \
            (k == "_lib" and (self.sidebar_visible or self._side_overlay))

    def _qbar_draw_lite(self):
        """BookReader's right band - part of the frame: your institution's logo on it, then the icons you put here."""
        q = self.qbar
        T = self.T
        q.delete("all")
        q.configure(bg=T["bg"])
        band = self._band_bg(q, "qb")
        ink = self._band_ink()[0] if band else T["icon"]
        hov = self._qb_hov
        rows = [("inst", 8, 50)]
        img_ = self._brand_icon()
        if hov == "inst":
            round_rect(q, 6, 9, QB_W - 6, 49, 10, fill="" if band else T["hover"], outline=ink if band else "", width=1)
        if img_ is not None:
            q.create_image(QB_W / 2, 29, image=img_)
        else:
            draw_icon(q, "building", QB_W / 2, 29, ink, s=0.78, w=1.5)
        y0 = 62
        q.create_line(14, y0 - 6, QB_W - 14, y0 - 6, fill=ink, width=1, dash=(1, 3))
        for k in self._lite_keys()[1]:
            kk = self._lite_show(k)
            col = ink
            if self._lite_lit(kk):
                round_rect(q, 7, y0 + 1, QB_W - 7, y0 + 35, 9, fill=ink if band else self.accent, outline="")
                col = (mix(self.accent, "#000000", 0.3) if ink == "#FFFFFF" else "#FFFFFF") if band else "#FFFFFF"
            elif hov == k:
                round_rect(q, 7, y0 + 1, QB_W - 7, y0 + 35, 9, fill="" if band else T["hover"],
                           outline=ink if band else "", width=1)
            if kk == "_reports":                                  # Reports stands out here too
                round_rect(q, 7, y0 + 1, QB_W - 7, y0 + 35, 9, fill=ink if band else self.accent, outline="")
                col = ("#FFFFFF" if ink != "#FFFFFF" else "#15151B") if band else "#FFFFFF"
            draw_icon(q, self.LITE_ICONS[kk], QB_W / 2, y0 + 18, col, s=0.74, w=1.5)
            rows.append((k, y0, y0 + 36))
            y0 += 40
        if getattr(self, "_lq_over", None) == "side":             # an icon on its way here
            q.create_line(10, y0 + 2, QB_W - 10, y0 + 2, fill=ink, width=2)
        self._lq_rows = rows

    def _lite_drag_move(self, e):
        d = getattr(self, "_lq_drag", None)
        if not d or d["k"] == "inst":
            return
        if abs(e.x_root - d["x0"]) + abs(e.y_root - d["y0"]) > 8:
            d["moved"] = True
        if not d["moved"]:
            return
        over = "side" if self._inside(self.qbar, e.x_root, e.y_root) else \
            ("top" if self._inside(self.topband, e.x_root, e.y_root) else None)
        for w_ in (self.topband, self.qbar):
            w_.configure(cursor="fleur")
        if over != getattr(self, "_lq_over", None):
            self._lq_over = over
            self._qbar_draw()

    def _lite_drag_up(self, e):
        d, self._lq_drag = getattr(self, "_lq_drag", None), None
        self._lq_over = None
        for w_ in (self.topband, self.qbar):
            try:
                w_.configure(cursor="")
            except Exception:
                pass
        if not d:
            return
        k = d["k"]
        if not d["moved"]:                                   # a click
            if k == "inst":
                self.quick_action("inst")
            else:
                self._tb_click(name=self._lite_show(k))
            self._qbar_draw()
            return
        if k == "inst":
            return
        top, side, right = self._lite_keys()
        for lst in (top, side, right):
            if k in lst:
                lst.remove(k)
        if self._inside(self.qbar, e.x_root, e.y_root):        # onto the band with the logo
            y = e.y_root - self.qbar.winfo_rooty()
            side.insert(max(0, min(len(side), int((y - 62 + 20) // 40))), k)
        elif self._inside(self.topband, e.x_root, e.y_root):   # anywhere along the top band: its left or its right
            x = e.x_root - self.topband.winfo_rootx()
            grp = right if x > self.topband.winfo_width() / 2 else top
            hits = [h for h in getattr(self, "_tb_hits", []) if self._lite_slot(h[2]) in grp]
            at = next((grp.index(self._lite_slot(h[2])) for h in hits if (h[0] + h[1]) / 2 > x), len(grp))
            grp.insert(at, k)
        else:
            return
        self.lib.settings["lite_top"], self.lib.settings["lite_side"], self.lib.settings["lite_topr"] = top, side, right
        self.lib.save_meta()
        self._tb_hov = self._qb_hov = None
        self._topband_draw()
        self._qbar_draw()

    def _lite_lib_close(self):
        self.side.place_forget()
        self.side_sep.place_forget()
        self._side_overlay = False
        self._topband_draw()

    def _lite_er_toggle(self):
        """BookReader: the eraser - click a highlight or a note and it goes (Ctrl+Z brings it back)."""
        self._lite_er = not getattr(self, "_lite_er", False)
        self._lite_hl = False
        self.set_tool("select")
        if self._lite_er:
            self._toast(_tr("Click a highlight or a note to delete it."))
        else:
            self.canvas.config(cursor="")
        self._topband_draw()

    def _lite_pct(self, f):
        try:
            rec = next((x for x in self.lib.settings.get("recent_docs", []) if x.get("f") == self.folder and x.get("rel") == f["rel"]), None)
            if rec and f["count"]:
                return f"{min(100, int(round((rec.get('p', 0) + 1) * 100.0 / f['count'])))}%"
        except Exception:
            pass
        return f["count"]

    def _lite_read(self):
        if self._side_overlay and not self.side_pinned:    # the library goes once a document is chosen
            self.root.after(250, self._lite_lib_close)
        if not getattr(self, "_reading", False) and self.book is not None:
            self.reading_mode(True)

    def _lite_bg(self, kind):
        """Three backgrounds: plain paper, the colours of the logo (soft), dark."""
        st = self.lib.settings
        rc = self._read_conf()
        cols = (st.get("brand") or {}).get("colors") or [self.accent]
        if kind == "dark":
            st["theme"], rc["bg"] = "Dark", "dark"
            st["background"] = {"mode": "none"}
        elif kind == "logo":
            st["theme"] = "Light"
            rc.update({"bg": "own", "colors": cols, "motion": "still"})
            st["background"] = {"mode": "gradient", "colors": [mix("#FAFAF9", c_, 0.18) for c_ in cols[:3]] + ["#FAFAF9"], "motion": "still"}
        else:
            st["theme"], rc["bg"] = "Light", "plain"
            st["background"] = {"mode": "none"}
        self.lib.save_meta()
        try:
            self.apply_theme()
        except Exception:
            pass
        self.apply_background()

    def _lite_update_check(self):
        """A quiet line when a newer BookReader is on bindlens.com (nothing is sent; only GitHub is asked)."""
        try:
            import urllib.request
            import calendar as _cal
            if not FROZEN:
                return
            with urllib.request.urlopen("https://api.github.com/repos/CKMohammed/BindLens/releases/latest", timeout=8) as r:
                data = json.loads(r.read().decode("utf-8"))
            a = next((x for x in data.get("assets", []) if x.get("name", "").lower().startswith("bookreader")), None)
            if not a:
                return
            t = _cal.timegm(time.strptime(a["updated_at"], "%Y-%m-%dT%H:%M:%SZ"))
            if t > os.path.getmtime(sys.executable) + 6 * 3600:
                self.root.after(0, lambda: self.set_status(_tr("A newer BookReader is on bindlens.com.")))
        except Exception:
            pass

    def _lite_hl_toggle(self):
        self._lite_hl = not getattr(self, "_lite_hl", False)
        self._lite_er = False
        self.set_tool("select")
        if self._lite_hl:
            self._toast(_tr("Select the words to highlight."))
        self._topband_draw()

    def _lite_folders(self):
        """The folders: read one; the one open - its name, icon and colour, its place."""
        m = tk.Menu(self.root, tearoff=0)
        for f in list(self.lib.folders):
            m.add_command(label=("✓ " if f == self.folder else "    ") + self.lib.label(f),
                          command=lambda f=f: (self._read_open(f, "", None) if getattr(self, "_reading", False) else self.open_folder(f)))
        m.add_separator()
        m.add_command(label=_tr("Add a folder…"), command=self._lite_add)
        if self.folder in self.lib.folders:
            cur = self.folder
            m.add_command(label=_tr("Rename this folder…"), command=lambda: (self.rename_folder(cur), self._topband_draw()))
            m.add_command(label=_tr("Its icon and colour…"), command=lambda: self.book_style_dialog(cur))
            lk_ = cur in self.lib.settings.get("locked_books", [])
            m.add_command(label=_tr("Remove its PIN" if lk_ else "Give it a PIN…"),
                          command=lambda: self.lock_book(cur, not lk_))
            m.add_command(label=_tr("Move it up"), command=lambda: self._lite_move(cur, -1))
            m.add_command(label=_tr("Move it down"), command=lambda: self._lite_move(cur, 1))
        try:
            m.tk_popup(self.root.winfo_pointerx(), self.root.winfo_pointery())
        finally:
            m.grab_release()

    def _lite_move(self, f, by):
        try:
            names = [c["name"] for c in self.lib.collections]
            i = names.index(f)
            j = max(0, min(len(names) - 1, i + by))
            self.lib.collections.insert(j, self.lib.collections.pop(i))
            self.lib.save_meta()
            self.reload()
        except Exception as ex:
            _log(f"bookreader move: {ex}")


def attach(app_class, names):
    """Join BookReader's parts to BindLens's window (App) - with BindLens's names (tk, _tr, mix…) to use."""
    keep = {"attach", "BookReaderParts"}
    globals().update({k: v for k, v in names.items() if not k.startswith("__") and k not in keep})
    for k, v in BookReaderParts.__dict__.items():
        if not k.startswith("__"):
            setattr(app_class, k, v)
