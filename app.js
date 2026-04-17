(function () {
  "use strict";

  const START_DATE = "2026-04-19";
  const DATE_WINDOW_STEP = 30;
  const INITIAL_DATE_WINDOW = 45;
  const REQUEST_TIMEOUT_MS = 12000;
  const CONFIG_STORAGE_KEY = "report-planner-config";
  const SESSION_STORAGE_KEY = "report-planner-session";
  const CACHE_STORAGE_PREFIX = "report-planner-cache:";

  const INITIAL_SUBJECTS = [
    { id: "subject-1", name: "文学国語", totalPages: 12 },
    { id: "subject-2", name: "日本史探求", totalPages: 12 },
    { id: "subject-3", name: "地理探求", totalPages: 12 },
    { id: "subject-4", name: "政治経済", totalPages: 6 },
    { id: "subject-5", name: "倫理", totalPages: 6 },
    { id: "subject-6", name: "数学A", totalPages: 6 },
    { id: "subject-7", name: "地学基礎", totalPages: 6 },
    { id: "subject-8", name: "音楽Ⅰ", totalPages: 6 },
    { id: "subject-9", name: "家庭総合", totalPages: 8 },
    { id: "subject-10", name: "体育Ⅱ", totalPages: 2 },
    { id: "subject-11", name: "保健", totalPages: 3 }
  ];

  const state = {
    config: loadJson(CONFIG_STORAGE_KEY, { supabaseUrl: "", supabaseAnonKey: "" }),
    session: loadJson(SESSION_STORAGE_KEY, null),
    subjects: [],
    reports: [],
    visibleDays: INITIAL_DATE_WINDOW,
    messages: []
  };

  const els = {
    appShell: byId("appShell"),
    authBadge: byId("authBadge"),
    authCard: byId("authCard"),
    authForm: byId("authForm"),
    configCard: byId("configCard"),
    configForm: byId("configForm"),
    connectionBadge: byId("connectionBadge"),
    dateInput: byId("dateInput"),
    dateList: byId("dateList"),
    emailInput: byId("emailInput"),
    loadMoreButton: byId("loadMoreButton"),
    messageArea: byId("messageArea"),
    messageTemplate: byId("messageTemplate"),
    pagesInput: byId("pagesInput"),
    passwordInput: byId("passwordInput"),
    refreshButton: byId("refreshButton"),
    resetAppButton: byId("resetAppButton"),
    scheduleForm: byId("scheduleForm"),
    signInButton: byId("signInButton"),
    signOutButton: byId("signOutButton"),
    signUpButton: byId("signUpButton"),
    subjectProgressList: byId("subjectProgressList"),
    subjectSelect: byId("subjectSelect"),
    summaryCards: byId("summaryCards"),
    supabaseAnonKeyInput: byId("supabaseAnonKeyInput"),
    supabaseUrlInput: byId("supabaseUrlInput"),
    syncStatusText: byId("syncStatusText"),
    timelineInfo: byId("timelineInfo"),
    toggleConfigButton: byId("toggleConfigButton")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    hydrateConfigForm();
    bindEvents();
    els.dateInput.min = START_DATE;
    els.dateInput.value = START_DATE;
    renderConnectionState();
    renderAuthState();
    renderMessages();
    renderEmptyState();

    if (!hasConfig()) {
      pushMessage("warning", "接続設定が必要です", "Supabase URL と anon key を入力して保存してください。");
      return;
    }

    if (!state.session) {
      pushMessage("success", "接続設定を読み込みました", "次はログインするか、新規登録してください。");
      return;
    }

    try {
      renderApp();
      pushMessage("success", "ログイン状態を復元しました", "データを同期しています。");
      await bootstrapApp();
    } catch (error) {
      console.error(error);
      clearSession();
      renderAuthState();
      pushMessage("error", "自動ログインに失敗しました", "もう一度ログインしてください。");
    }
  }

  function bindEvents() {
    els.configForm.addEventListener("submit", handleConfigSave);
    els.authForm.addEventListener("submit", handleSignIn);
    els.signUpButton.addEventListener("click", handleSignUp);
    els.scheduleForm.addEventListener("submit", handleScheduleCreate);
    els.signOutButton.addEventListener("click", handleSignOut);
    els.resetAppButton.addEventListener("click", handleResetApp);
    els.refreshButton.addEventListener("click", bootstrapApp);
    els.loadMoreButton.addEventListener("click", handleLoadMore);
    els.toggleConfigButton.addEventListener("click", () => {
      els.configCard.classList.toggle("hidden");
    });
    els.dateList.addEventListener("click", handleDateListClick);
  }

  function hydrateConfigForm() {
    els.supabaseUrlInput.value = state.config.supabaseUrl || "";
    els.supabaseAnonKeyInput.value = state.config.supabaseAnonKey || "";
  }

  function hasConfig() {
    return Boolean(state.config.supabaseUrl && state.config.supabaseAnonKey);
  }

  async function handleConfigSave(event) {
    event.preventDefault();

    state.config = {
      supabaseUrl: normalizeUrl(els.supabaseUrlInput.value),
      supabaseAnonKey: els.supabaseAnonKeyInput.value.trim()
    };

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state.config));
    renderConnectionState();
    pushMessage("success", "接続設定を保存しました", "この端末では次回以降も自動で読み込みます。");
  }

  async function handleSignIn(event) {
    event.preventDefault();

    if (!hasConfig()) {
      pushMessage("warning", "先に接続設定を保存してください", "Supabase URL と anon key が必要です。");
      return;
    }

    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;

    try {
      const session = await authWithPassword(email, password);
      saveSession(session);
      await bootstrapApp();
      pushMessage("success", "ログインしました", "クラウドの予定を読み込みました。");
    } catch (error) {
      console.error(error);
      pushMessage("error", "ログインに失敗しました", humanizeError(error));
    }
  }

  async function handleSignUp() {
    if (!hasConfig()) {
      pushMessage("warning", "先に接続設定を保存してください", "Supabase URL と anon key が必要です。");
      return;
    }

    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;

    try {
      const session = await signUp(email, password);
      if (!session.access_token) {
        pushMessage("warning", "登録できました", "メール確認が有効な設定です。確認後にログインしてください。");
        return;
      }

      saveSession(session);
      await bootstrapApp();
      pushMessage("success", "新規登録が完了しました", "初期科目データを準備しました。");
    } catch (error) {
      console.error(error);
      pushMessage("error", "新規登録に失敗しました", humanizeError(error));
    }
  }

  async function handleSignOut() {
    clearSession();
    state.subjects = [];
    state.reports = [];
    state.visibleDays = INITIAL_DATE_WINDOW;
    renderAuthState();
    renderEmptyState();
    pushMessage("success", "ログアウトしました", "別の端末でも、同じアカウントでログインすれば同期できます。");
  }

  function handleResetApp() {
    clearSession();
    state.subjects = [];
    state.reports = [];
    state.visibleDays = INITIAL_DATE_WINDOW;
    state.messages = [];
    clearAllCaches();
    renderMessages();
    renderAuthState();
    renderConnectionState();
    renderEmptyState();
    pushMessage("success", "初期化しました", "接続設定を残したまま、ログイン状態と一時データを消しました。もう一度ログインしてください。");
  }

  async function bootstrapApp() {
    if (!state.session) {
      renderAuthState();
      return;
    }

    els.appShell.classList.remove("hidden");
    els.syncStatusText.textContent = "同期中...";
    renderAuthState();

    try {
      await restoreSession();
      await ensureSubjects();
      await loadAppData();
      renderApp();
      pushMessage("success", "同期完了", "最新のレポート予定を表示しています。");
    } catch (error) {
      console.error(error);
      restoreCache();
      renderApp();
      pushMessage("warning", "クラウド同期に失敗しました", "保存済みのローカルキャッシュを表示しています。通信状態を確認して再読み込みしてください。");
    }
  }

  async function handleScheduleCreate(event) {
    event.preventDefault();

    if (!state.session) {
      pushMessage("warning", "ログインが必要です", "先にログインしてください。");
      return;
    }

    const date = els.dateInput.value;
    const subjectId = els.subjectSelect.value;
    const requestedPages = Number(els.pagesInput.value);

    if (!date || date < START_DATE) {
      pushMessage("warning", "開始日より前には追加できません", `${START_DATE} 以降の日付を選択してください。`);
      return;
    }

    if (!Number.isInteger(requestedPages) || requestedPages <= 0) {
      pushMessage("warning", "枚数を確認してください", "1 以上の整数を入力してください。");
      return;
    }

    const validation = getAllowedPages({ date, subjectId, requestedPages });

    validation.messages.forEach((message) => {
      pushMessage(message.tone, message.title, message.body);
    });

    if (validation.allowedPages <= 0) {
      return;
    }

    const report = {
      id: createId(),
      user_id: state.session.user.id,
      date,
      subject_id: subjectId,
      pages: validation.allowedPages,
      completed: false,
      completed_at: null
    };

    try {
      const [created] = await apiRequest("/rest/v1/scheduled_reports", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(report)
      });

      state.reports.push(created);
      persistCache();
      renderApp();
      pushMessage("success", "予定を追加しました", `${findSubject(subjectId).name} を ${validation.allowedPages} 枚追加しました。`);
      els.pagesInput.value = "1";
    } catch (error) {
      console.error(error);
      pushMessage("error", "予定追加に失敗しました", humanizeError(error));
    }
  }

  async function handleDateListClick(event) {
    const toggleButton = event.target.closest("[data-action='toggle-complete']");
    const deleteButton = event.target.closest("[data-action='delete-report']");

    if (toggleButton) {
      const reportId = toggleButton.dataset.reportId;
      const report = state.reports.find((item) => item.id === reportId);
      if (!report) {
        return;
      }

      const nextCompleted = !report.completed;
      const payload = {
        completed: nextCompleted,
        completed_at: nextCompleted ? new Date().toISOString() : null
      };

      try {
        const [updated] = await apiRequest(`/rest/v1/scheduled_reports?id=eq.${encodeURIComponent(report.id)}&user_id=eq.${encodeURIComponent(state.session.user.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload)
        });

        Object.assign(report, updated);
        persistCache();
        renderApp();

        const subjectStats = buildSubjectStats().find((item) => item.id === report.subject_id);
        if (subjectStats && subjectStats.isComplete) {
          pushMessage("success", `${subjectStats.name}レポート完了！`, "この科目の総枚数ぶんをすべて完了しました。");
        }
      } catch (error) {
        console.error(error);
        pushMessage("error", "完了状態の更新に失敗しました", humanizeError(error));
      }
      return;
    }

    if (deleteButton) {
      const reportId = deleteButton.dataset.reportId;
      try {
        await apiRequest(`/rest/v1/scheduled_reports?id=eq.${encodeURIComponent(reportId)}&user_id=eq.${encodeURIComponent(state.session.user.id)}`, {
          method: "DELETE"
        });

        state.reports = state.reports.filter((item) => item.id !== reportId);
        persistCache();
        renderApp();
        pushMessage("success", "予定を削除しました", "未割り当て枚数に戻しました。");
      } catch (error) {
        console.error(error);
        pushMessage("error", "予定削除に失敗しました", humanizeError(error));
      }
    }
  }

  function handleLoadMore() {
    state.visibleDays += DATE_WINDOW_STEP;
    renderTimeline();
  }

  async function restoreSession() {
    if (!state.session) {
      return;
    }

    const expiresAt = Number(state.session.expires_at || 0);
    const expiresSoon = Date.now() >= expiresAt - 60 * 1000;

    if (!expiresSoon) {
      return;
    }

    const refreshed = await refreshSession(state.session.refresh_token);
    saveSession(refreshed);
  }

  async function ensureSubjects() {
    const existing = await apiRequest(`/rest/v1/subjects?select=id,name,total_pages&user_id=eq.${encodeURIComponent(state.session.user.id)}&order=created_at.asc`);

    if (existing.length > 0) {
      state.subjects = mapSubjectsFromApi(existing);
      return;
    }

    const payload = INITIAL_SUBJECTS.map((subject) => ({
      id: subject.id,
      user_id: state.session.user.id,
      name: subject.name,
      total_pages: subject.totalPages
    }));

    const inserted = await apiRequest("/rest/v1/subjects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });

    state.subjects = mapSubjectsFromApi(inserted);
  }

  async function loadAppData() {
    const [subjects, reports] = await Promise.all([
      apiRequest(`/rest/v1/subjects?select=id,name,total_pages&user_id=eq.${encodeURIComponent(state.session.user.id)}&order=created_at.asc`),
      apiRequest(`/rest/v1/scheduled_reports?select=id,date,subject_id,pages,completed,completed_at&user_id=eq.${encodeURIComponent(state.session.user.id)}&order=date.asc,created_at.asc`)
    ]);

    state.subjects = mapSubjectsFromApi(subjects);
    state.reports = reports;
    persistCache();
  }

  function renderApp() {
    els.appShell.classList.remove("hidden");
    renderAuthState();
    renderConnectionState();
    renderSubjectOptions();
    renderSummary();
    renderSubjectProgress();
    renderTimeline();
    els.syncStatusText.textContent = `最終同期: ${formatDateTime(new Date())}`;
    els.appShell.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderEmptyState() {
    els.appShell.classList.add("hidden");
    els.summaryCards.innerHTML = "";
    els.subjectProgressList.innerHTML = "";
    els.dateList.innerHTML = "";
    els.timelineInfo.textContent = "開始日から順番に表示します。";
  }

  function renderConnectionState() {
    if (hasConfig()) {
      els.connectionBadge.textContent = "接続設定済み";
      els.connectionBadge.className = "badge badge-success";
    } else {
      els.connectionBadge.textContent = "未接続";
      els.connectionBadge.className = "badge badge-muted";
    }
  }

  function renderAuthState() {
    const loggedIn = Boolean(state.session && state.session.user);
    els.authBadge.textContent = loggedIn ? state.session.user.email : "未ログイン";
    els.authBadge.className = loggedIn ? "badge badge-success" : "badge badge-muted";
    els.signOutButton.classList.toggle("hidden", !loggedIn);
    els.authCard.classList.toggle("hidden", loggedIn);
    els.configCard.classList.toggle("hidden", loggedIn);
  }

  function renderSummary() {
    const subjectStats = buildSubjectStats();
    const totals = subjectStats.reduce((accumulator, item) => {
      accumulator.totalPages += item.totalPages;
      accumulator.assignedPages += item.assignedPages;
      accumulator.completedPages += item.completedPages;
      accumulator.unassignedPages += item.unassignedPages;
      return accumulator;
    }, { totalPages: 0, assignedPages: 0, completedPages: 0, unassignedPages: 0 });

    const completedSubjects = subjectStats.filter((item) => item.isComplete).length;
    const cardData = [
      { label: "総枚数", value: `${totals.totalPages}` },
      { label: "割り当て済み", value: `${totals.assignedPages}` },
      { label: "未割り当て", value: `${totals.unassignedPages}` },
      { label: "完了科目", value: `${completedSubjects}/${state.subjects.length}` }
    ];

    els.summaryCards.innerHTML = cardData.map((card) => `
      <article class="summary-card">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
      </article>
    `).join("");
  }

  function renderSubjectProgress() {
    const stats = buildSubjectStats();

    els.subjectProgressList.innerHTML = stats.map((item) => `
      <article class="subject-card ${item.isComplete ? "complete" : ""}">
        <div class="subject-head">
          <div>
            <div class="subject-name">${escapeHtml(item.name)}</div>
            <div class="subject-meta">
              <span>総枚数 ${item.totalPages} 枚</span>
              <span>割り当て済み ${item.assignedPages} 枚</span>
              <span>未割り当て ${item.unassignedPages} 枚</span>
              <span>完了済み ${item.completedPages} 枚</span>
            </div>
          </div>
          <span class="badge ${item.isComplete ? "badge-success" : "badge-warning"}">
            ${item.isComplete ? "完了" : "進行中"}
          </span>
        </div>
        <div class="progress-bar" aria-hidden="true">
          <span style="width:${item.completionRate}%"></span>
        </div>
        <p class="empty-text">
          ${item.isComplete ? `${escapeHtml(item.name)}レポート完了！` : `完了率 ${item.completionRate.toFixed(0)}%`}
        </p>
      </article>
    `).join("");
  }

  function renderTimeline() {
    const dates = getVisibleDates();
    const reportsByDate = groupReportsByDate();
    const totalVisiblePages = dates.reduce((sum, date) => {
      const items = reportsByDate.get(date) || [];
      return sum + items.reduce((innerSum, item) => innerSum + item.pages, 0);
    }, 0);

    els.timelineInfo.textContent = `${dates[0]} から ${dates[dates.length - 1]} まで表示中 / 表示範囲内 ${totalVisiblePages} 枚`;

    els.dateList.innerHTML = dates.map((date) => {
      const items = reportsByDate.get(date) || [];
      const totalPages = items.reduce((sum, item) => sum + item.pages, 0);
      return `
        <article class="date-card ${date === START_DATE ? "today-focus" : ""}">
          <div class="date-head">
            <div>
              <div class="date-title">${formatDateLabel(date)}</div>
              <div class="date-meta">合計 ${totalPages} 枚 / 予定 ${items.length} 件</div>
            </div>
            <button class="ghost-button" type="button" data-action="prefill-date" data-date="${date}">この日で追加</button>
          </div>
          <div class="schedule-list">
            ${items.length ? items.map(renderScheduleItem).join("") : `<p class="empty-text">この日の予定はまだありません。</p>`}
          </div>
        </article>
      `;
    }).join("");

    els.dateList.querySelectorAll("[data-action='prefill-date']").forEach((button) => {
      button.addEventListener("click", () => {
        els.dateInput.value = button.dataset.date;
        els.scheduleForm.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function renderScheduleItem(item) {
    const subject = findSubject(item.subject_id);
    const completedLabel = item.completed ? "完了を取り消す" : "完了にする";
    const completedMark = item.completed ? "✓ " : "";

    return `
      <article class="schedule-item ${item.completed ? "completed" : ""}">
        <div class="schedule-topline">
          <div>
            <div class="schedule-title">${completedMark}${escapeHtml(subject ? subject.name : "不明な科目")} ${item.pages} 枚</div>
            <div class="schedule-meta">
              ${item.completed ? `完了日時 ${formatDateTime(item.completed_at)}` : "未完了"}
            </div>
          </div>
          <span class="badge ${item.completed ? "badge-success" : "badge-muted"}">${item.completed ? "完了" : "予定"}</span>
        </div>
        <div class="schedule-actions">
          <button class="secondary-button" type="button" data-action="toggle-complete" data-report-id="${item.id}">
            ${completedLabel}
          </button>
          <button class="text-button" type="button" data-action="delete-report" data-report-id="${item.id}">
            予定を削除
          </button>
        </div>
      </article>
    `;
  }

  function renderSubjectOptions() {
    if (state.subjects.length === 0) {
      els.subjectSelect.innerHTML = `<option value="">科目データ未読み込み</option>`;
      els.subjectSelect.disabled = true;
      return;
    }

    els.subjectSelect.disabled = false;
    els.subjectSelect.innerHTML = state.subjects.map((subject) => `
      <option value="${subject.id}">${escapeHtml(subject.name)}</option>
    `).join("");
  }

  function buildSubjectStats() {
    return state.subjects.map((subject) => {
      const reports = state.reports.filter((item) => item.subject_id === subject.id);
      const assignedPages = reports.reduce((sum, item) => sum + item.pages, 0);
      const completedPages = reports.filter((item) => item.completed).reduce((sum, item) => sum + item.pages, 0);
      const unassignedPages = Math.max(subject.totalPages - assignedPages, 0);
      const isComplete = completedPages >= subject.totalPages;
      const completionRate = subject.totalPages === 0 ? 0 : Math.min(100, (completedPages / subject.totalPages) * 100);

      return {
        ...subject,
        assignedPages,
        completedPages,
        unassignedPages,
        isComplete,
        completionRate
      };
    });
  }

  function getAllowedPages({ date, subjectId, requestedPages }) {
    const subject = findSubject(subjectId);
    const subjectReports = state.reports.filter((item) => item.subject_id === subjectId);
    const sameDayPages = subjectReports
      .filter((item) => item.date === date)
      .reduce((sum, item) => sum + item.pages, 0);
    const assignedPages = subjectReports.reduce((sum, item) => sum + item.pages, 0);
    const remainingPages = Math.max(subject.totalPages - assignedPages, 0);
    const allowedByDay = Math.max(2 - sameDayPages, 0);
    const allowedPages = Math.min(requestedPages, allowedByDay, remainingPages);
    const messages = [];

    if (sameDayPages >= 2) {
      messages.push({
        tone: "warning",
        title: "同一科目は 1 日 2 枚までです",
        body: `${subject.name} はこの日にすでに ${sameDayPages} 枚あります。追加できませんでした。`
      });
    } else if (requestedPages > allowedByDay) {
      messages.push({
        tone: "warning",
        title: "1 日 2 枚の上限で一部だけ追加します",
        body: `${subject.name} はこの日に最大 ${allowedByDay} 枚までなので、残りは未割り当てのままです。`
      });
    }

    if (remainingPages <= 0) {
      messages.push({
        tone: "warning",
        title: "総必要枚数に達しています",
        body: `${subject.name} はすでに総枚数 ${subject.totalPages} 枚ぶん割り当て済みです。`
      });
    } else if (requestedPages > remainingPages) {
      messages.push({
        tone: "warning",
        title: "残り枚数ぶんだけ追加します",
        body: `${subject.name} の未割り当てはあと ${remainingPages} 枚です。`
      });
    }

    return { allowedPages, messages };
  }

  function groupReportsByDate() {
    const map = new Map();

    state.reports.forEach((item) => {
      if (!map.has(item.date)) {
        map.set(item.date, []);
      }
      map.get(item.date).push(item);
    });

    return map;
  }

  function getVisibleDates() {
    const dates = [];
    const lastScheduledDate = state.reports.reduce((latest, item) => item.date > latest ? item.date : latest, START_DATE);
    const latestRequired = addDays(lastScheduledDate, 7);
    const minimumEnd = addDays(START_DATE, state.visibleDays - 1);
    const finalEnd = latestRequired > minimumEnd ? latestRequired : minimumEnd;

    for (let current = START_DATE; current <= finalEnd; current = addDays(current, 1)) {
      dates.push(current);
    }

    return dates;
  }

  function persistCache() {
    if (!state.session || !state.session.user) {
      return;
    }

    localStorage.setItem(`${CACHE_STORAGE_PREFIX}${state.session.user.id}`, JSON.stringify({
      subjects: state.subjects,
      reports: state.reports
    }));
  }

  function restoreCache() {
    if (!state.session || !state.session.user) {
      return;
    }

    const cached = loadJson(`${CACHE_STORAGE_PREFIX}${state.session.user.id}`, null);
    if (!cached) {
      return;
    }

    state.subjects = cached.subjects || [];
    state.reports = cached.reports || [];
  }

  async function authWithPassword(email, password) {
    return requestJson("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: authHeaders(false),
      body: JSON.stringify({ email, password })
    });
  }

  async function signUp(email, password) {
    return requestJson("/auth/v1/signup", {
      method: "POST",
      headers: authHeaders(false),
      body: JSON.stringify({ email, password })
    });
  }

  async function refreshSession(refreshToken) {
    return requestJson("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: authHeaders(false),
      body: JSON.stringify({ refresh_token: refreshToken })
    });
  }

  async function apiRequest(path, options) {
    return requestJson(path, {
      ...options,
      headers: {
        ...authHeaders(true),
        ...(options && options.headers ? options.headers : {})
      }
    });
  }

  async function requestJson(path, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(`${state.config.supabaseUrl}${path}`, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(data && data.msg ? data.msg : data && data.error_description ? data.error_description : response.statusText);
      error.payload = data;
      throw error;
    }

    return data;
  }

  function authHeaders(withSession) {
    const headers = {
      apikey: state.config.supabaseAnonKey,
      "Content-Type": "application/json"
    };

    if (withSession && state.session && state.session.access_token) {
      headers.Authorization = `Bearer ${state.session.access_token}`;
    }

    return headers;
  }

  function saveSession(session) {
    state.session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + Number(session.expires_in || 3600) * 1000,
      user: session.user
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
  }

  function clearSession() {
    state.session = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  function clearAllCaches() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  }

  function pushMessage(tone, title, body) {
    state.messages.unshift({
      id: createId(),
      tone,
      title,
      body
    });

    state.messages = state.messages.slice(0, 6);
    renderMessages();
  }

  function renderMessages() {
    els.messageArea.innerHTML = "";

    state.messages.forEach((message) => {
      const fragment = els.messageTemplate.content.cloneNode(true);
      const article = fragment.querySelector(".message-item");
      article.dataset.tone = message.tone;
      fragment.querySelector(".message-title").textContent = message.title;
      fragment.querySelector(".message-body").textContent = message.body;
      els.messageArea.appendChild(fragment);
    });
  }

  function findSubject(subjectId) {
    return state.subjects.find((item) => item.id === subjectId) || INITIAL_SUBJECTS.find((item) => item.id === subjectId);
  }

  function mapSubjectsFromApi(subjects) {
    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      totalPages: Number(subject.total_pages)
    }));
  }

  function normalizeUrl(url) {
    return url.trim().replace(/\/+$/, "");
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error(error);
      return fallback;
    }
  }

  function addDays(dateString, days) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function formatDateLabel(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(new Date(year, month - 1, day, 12, 0, 0));
  }

  function formatDateTime(dateValue) {
    if (!dateValue) {
      return "-";
    }

    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(dateValue));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function humanizeError(error) {
    const message = error && error.message ? error.message : "不明なエラーです。";

    if (error && error.name === "AbortError") {
      return "Supabase への通信がタイムアウトしました。少し待って再読み込みしてください。";
    }

    if (message.includes("Invalid login credentials")) {
      return "メールアドレスまたはパスワードが違います。";
    }

    if (message.includes("Email not confirmed")) {
      return "メール確認がまだ完了していません。";
    }

    if (message.includes("fetch")) {
      return "Supabase に接続できませんでした。URL と anon key を確認してください。";
    }

    return message;
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
