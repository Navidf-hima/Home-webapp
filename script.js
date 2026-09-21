// ========================================
// OUR HOME - Complete Application JavaScript
// ========================================

// OVERRIDE GLOBAL ALERT -> TOAST
window.alert = function (message) {
    showToast(String(message), "info");
};

function showToast(message, type = "success", duration = 3000) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "✓";
    if (type === "error") icon = "!";
    if (type === "warning") icon = "⚠";

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message"></div>
    `;

    toast.querySelector(".toast-message").textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

// DOM ELEMENTS
const authScreen = document.getElementById("auth-screen");
const accessScreen = document.getElementById("access-screen");
const app = document.getElementById("app");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const accessForm = document.getElementById("access-form");

const authMessage = document.getElementById("auth-message");
const requestMessage = document.getElementById("request-message");

const showSignupBtn = document.getElementById("show-signup");
const showLoginBtn = document.getElementById("show-login");
const logoutBtn = document.getElementById("logout-btn");
const logoutRequestBtn = document.getElementById("logout-request-btn");

// STATE
let currentUser = null;
let currentUserName = "Member";
let currentUserIsAdmin = false;
let membersCache = [];

let activitiesStarted = false;
let messagesStarted = false;
let tasksStarted = false;
let expensesStarted = false;
let membersStarted = false;
let requestsStarted = false;

let allTasks = [];
let allExpenses = [];

// FIRESTORE & AUTH IMPORTS (CACHED)
let firestoreModule = null;
let authModule = null;

async function getFirestoreModule() {
    if (!firestoreModule) {
        firestoreModule = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js");
    }
    return firestoreModule;
}

async function getAuthModule() {
    if (!authModule) {
        authModule = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js");
    }
    return authModule;
}

// ========================================
// AUTH TOGGLES
// ========================================
showSignupBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
    document.getElementById("auth-subtitle").textContent = "Create a new account";
    authMessage.textContent = "";
});

showLoginBtn.addEventListener("click", (e) => {
    e.preventDefault();
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    document.getElementById("auth-subtitle").textContent = "Login to your account";
    authMessage.textContent = "";
});

// ========================================
// LOGIN & SIGNUP HANDLERS
// ========================================
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();

    try {
        const { signInWithEmailAndPassword } = await getAuthModule();
        await signInWithEmailAndPassword(window.firebaseAuth, email, password);
        showToast("Login successful!", "success");
    } catch (error) {
        console.error("Login error:", error);
        authMessage.textContent = "Invalid email or password.";
        showToast("Login failed", "error");
    }
});

signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value.trim();

    try {
        const { createUserWithEmailAndPassword, updateProfile } = await getAuthModule();
        const userCredential = await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        showToast("Account created successfully!", "success");
    } catch (error) {
        console.error("Signup error:", error);
        authMessage.textContent = error.message || "Failed to create account.";
        showToast("Sign up failed", "error");
    }
});

// LOGOUT
async function handleLogout() {
    try {
        const { signOut } = await getAuthModule();
        await signOut(window.firebaseAuth);
        location.reload();
    } catch (error) {
        console.error("Logout error:", error);
    }
}
logoutBtn?.addEventListener("click", handleLogout);
logoutRequestBtn?.addEventListener("click", handleLogout);

// ========================================
// FIREBASE AUTH LISTENER
// ========================================
window.addEventListener("firebase-auth-changed", async (e) => {
    currentUser = e.detail.user;

    if (!currentUser) {
        authScreen.classList.remove("hidden");
        accessScreen.classList.add("hidden");
        app.classList.add("hidden");
        return;
    }

    authScreen.classList.add("hidden");
    await checkUserAccess();
});

// ========================================
// ACCESS REQUEST SUBMIT
// ========================================
accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("user-name").value.trim();
    const inviteCode = document.getElementById("invite-code").value.trim();

    if (!name || !inviteCode) {
        requestMessage.textContent = "Please fill in everything.";
        return;
    }

    try {
        const { doc, setDoc, serverTimestamp } = await getFirestoreModule();
        await setDoc(doc(window.firebaseDB, "accessRequests", currentUser.uid), {
            name: name,
            email: currentUser.email,
            inviteCode: inviteCode,
            status: "pending",
            createdAt: serverTimestamp()
        });

        requestMessage.textContent = "Access request submitted. Waiting for admin approval.";
        showToast("Request submitted!", "success");
        document.getElementById("user-name").disabled = true;
        document.getElementById("invite-code").disabled = true;
        accessForm.querySelector("button").disabled = true;
    } catch (error) {
        console.error("Access request error:", error);
        requestMessage.textContent = "Could not submit request.";
        showToast("Request failed", "error");
    }
});

// ========================================
// CHECK USER ACCESS
// ========================================
async function checkUserAccess() {
    if (!currentUser) return;

    try {
        const { doc, getDoc } = await getFirestoreModule();

        // CHECK MULTIPLE ADMINS
        const adminDoc = await getDoc(doc(window.firebaseDB, "admins", currentUser.uid));
        if (adminDoc.exists() && adminDoc.data().active === true) {
            currentUserIsAdmin = true;
            currentUserName = currentUser.displayName || "Admin";
            openApplication("Welcome, Admin 👋");
            startApplication();
            return;
        }

        // CHECK MEMBER
        const memberDoc = await getDoc(doc(window.firebaseDB, "members", currentUser.uid));
        if (memberDoc.exists() && memberDoc.data().approved === true) {
            currentUserIsAdmin = false;
            currentUserName = memberDoc.data().name || currentUser.displayName || "Member";
            openApplication(`Welcome, ${currentUserName} 👋`);
            startApplication();
            return;
        }

        // NOT APPROVED YET -> SHOW REQUEST SCREEN
        accessScreen.classList.remove("hidden");
        app.classList.add("hidden");
        await showRequestStatus(currentUser.uid);

    } catch (error) {
        console.error("Access check error:", error);
        requestMessage.textContent = "Could not check access.";
    }
}

function openApplication(welcomeText) {
    accessScreen.classList.add("hidden");
    app.classList.remove("hidden");

    const welcome = document.getElementById("welcome-name");
    if (welcome) welcome.textContent = welcomeText;

    const roleBadge = document.getElementById("role-badge");
    if (roleBadge) roleBadge.textContent = currentUserIsAdmin ? "Admin" : "Member";
}

async function showRequestStatus(uid) {
    try {
        const { doc, getDoc } = await getFirestoreModule();
        const requestDoc = await getDoc(doc(window.firebaseDB, "accessRequests", uid));

        if (!requestDoc.exists()) {
            requestMessage.textContent = "Enter your name and invite code to request access.";
            return;
        }

        const data = requestDoc.data();
        if (data.status === "pending") {
            requestMessage.textContent = "Your request is pending admin approval.";
            return;
        }
        if (data.status === "rejected") {
            requestMessage.textContent = "Your request was rejected. You can submit a new request.";
            return;
        }
    } catch (error) {
        console.error("Request status error:", error);
    }
}

// ========================================
// START APP
// ========================================
function startApplication() {
    loadAdminPanel();
    startMembers();
    startActivities();
    startMessages();
    startTasks();
    startExpenses();
    setupNavigation();
}

// ADMIN PANEL
async function loadAdminPanel() {
    if (!currentUserIsAdmin || requestsStarted) return;
    requestsStarted = true;

    document.getElementById("admin-panel")?.classList.remove("hidden");
    document.getElementById("task-admin-panel")?.classList.remove("hidden");

    const { collection, query, where, onSnapshot } = await getFirestoreModule();
    const requestsQuery = query(collection(window.firebaseDB, "accessRequests"), where("status", "==", "pending"));

    onSnapshot(requestsQuery, (snapshot) => {
        renderAccessRequests(snapshot);
    }, (error) => {
        console.error("Requests listener error:", error);
    });
}

function renderAccessRequests(snapshot) {
    const requestsList = document.getElementById("requests-list");
    const requestCount = document.getElementById("request-count");

    requestsList.innerHTML = "";
    requestCount.textContent = snapshot.size;

    if (snapshot.empty) {
        requestsList.innerHTML = `<p class="loading-text">No pending requests.</p>`;
        return;
    }

    snapshot.forEach((requestDoc) => {
        const data = requestDoc.data();
        const card = document.createElement("div");
        card.className = "request-card";

        card.innerHTML = `
            <h3>${data.name || "Unknown User"}</h3>
            <p class="request-info">Email: ${data.email || "N/A"}</p>
            <p class="request-info">Invite Code: ${data.inviteCode || "N/A"}</p>
            <div class="request-actions">
                <button class="approve-btn">Approve</button>
                <button class="reject-btn">Reject</button>
            </div>
        `;

        card.querySelector(".approve-btn").addEventListener("click", () => approveUser(requestDoc.id));
        card.querySelector(".reject-btn").addEventListener("click", () => rejectUser(requestDoc.id));

        requestsList.appendChild(card);
    });
}

async function approveUser(uid) {
    try {
        const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = await getFirestoreModule();
        const requestRef = doc(window.firebaseDB, "accessRequests", uid);
        const requestDoc = await getDoc(requestRef);

        if (!requestDoc.exists()) return;
        const data = requestDoc.data();

        await setDoc(doc(window.firebaseDB, "members", uid), {
            name: data.name || "Member",
            email: data.email || "",
            approved: true,
            approvedAt: serverTimestamp()
        });

        await updateDoc(requestRef, {
            status: "approved",
            approvedAt: serverTimestamp()
        });

        showToast(`${data.name} approved successfully!`, "success");
    } catch (error) {
        console.error("Approve error:", error);
        showToast("Could not approve user.", "error");
    }
}

async function rejectUser(uid) {
    try {
        const { doc, updateDoc, serverTimestamp } = await getFirestoreModule();
        await updateDoc(doc(window.firebaseDB, "accessRequests", uid), {
            status: "rejected",
            rejectedAt: serverTimestamp()
        });
        showToast("Access request rejected.", "warning");
    } catch (error) {
        console.error("Reject error:", error);
        showToast("Could not reject request.", "error");
    }
}

// MEMBERS
async function startMembers() {
    if (membersStarted) return;
    membersStarted = true;

    try {
        const { collection, query, where, onSnapshot } = await getFirestoreModule();
        const membersQuery = query(collection(window.firebaseDB, "members"), where("approved", "==", true));

        onSnapshot(membersQuery, (snapshot) => {
            membersCache = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            membersCache.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

            renderMembers();
            renderExpensePayerOptions();
            renderTasks();
            renderExpenseSummary();
        });
    } catch (error) {
        console.error("Members error:", error);
    }
}

function renderMembers() {
    const list = document.getElementById("members-list");
    list.innerHTML = "";

    if (membersCache.length === 0) {
        list.innerHTML = `<p class="loading-text">No approved members yet.</p>`;
        return;
    }

    membersCache.forEach((member) => {
        const card = document.createElement("div");
        card.className = "member-card";
        card.innerHTML = `
            <div class="member-avatar">${getInitial(member.name)}</div>
            <div class="member-info">
                <strong>${member.name || "Member"}</strong>
                <span>Approved member</span>
            </div>
        `;
        list.appendChild(card);
    });
}

// ACTIVITIES
async function startActivities() {
    if (activitiesStarted) return;
    activitiesStarted = true;

    const form = document.getElementById("activity-form");
    const input = document.getElementById("activity-input");
    const list = document.getElementById("activity-list");

    try {
        const { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } = await getFirestoreModule();

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            try {
                await addDoc(collection(window.firebaseDB, "activities"), {
                    text: text,
                    userId: currentUser.uid,
                    userName: currentUserName,
                    createdAt: serverTimestamp()
                });
                input.value = "";
            } catch (error) {
                console.error("Activity submit error:", error);
            }
        });

        const activitiesQuery = query(collection(window.firebaseDB, "activities"), orderBy("createdAt", "desc"));
        onSnapshot(activitiesQuery, (snapshot) => {
            list.innerHTML = "";
            if (snapshot.empty) {
                list.innerHTML = `<p class="loading-text">No activities yet.</p>`;
                return;
            }

            snapshot.forEach((activityDoc) => {
                const data = activityDoc.data();
                const card = document.createElement("div");
                card.className = "activity-card";
                card.innerHTML = `
                    <div class="activity-author">${data.userName || "Member"}</div>
                    <div class="activity-text">${data.text || ""}</div>
                    <div class="activity-time">${formatTimestamp(data.createdAt)}</div>
                `;
                list.appendChild(card);
            });
        });
    } catch (error) {
        console.error("Activities error:", error);
    }
}

// MESSAGES
async function startMessages() {
    if (messagesStarted) return;
    messagesStarted = true;

    const form = document.getElementById("message-form");
    const input = document.getElementById("message-input");
    const list = document.getElementById("messages-list");

    try {
        const { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } = await getFirestoreModule();

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            try {
                await addDoc(collection(window.firebaseDB, "messages"), {
                    text: text,
                    senderId: currentUser.uid,
                    senderName: currentUserName,
                    createdAt: serverTimestamp()
                });
                input.value = "";
            } catch (error) {
                console.error("Send message error:", error);
            }
        });

        const messagesQuery = query(collection(window.firebaseDB, "messages"), orderBy("createdAt", "asc"));
        onSnapshot(messagesQuery, (snapshot) => {
            list.innerHTML = "";
            if (snapshot.empty) {
                list.innerHTML = `<p class="loading-text">No messages yet.</p>`;
                return;
            }

            snapshot.forEach((messageDoc) => {
                const data = messageDoc.data();
                const card = document.createElement("div");
                card.className = "message-card";
                card.innerHTML = `
                    <div class="message-author">${data.senderName || "Member"}</div>
                    <div class="message-text">${data.text || ""}</div>
                    <div class="message-time">${formatTimestamp(data.createdAt)}</div>
                `;
                list.appendChild(card);
            });
            list.scrollTop = list.scrollHeight;
        });
    } catch (error) {
        console.error("Messages error:", error);
    }
}

// TASKS
async function startTasks() {
    if (tasksStarted) return;
    tasksStarted = true;

    const { collection, query, orderBy, onSnapshot } = await getFirestoreModule();
    const tasksQuery = query(collection(window.firebaseDB, "tasks"), orderBy("createdAt", "desc"));

    onSnapshot(tasksQuery, (snapshot) => {
        allTasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderTasks();
    });

    const form = document.getElementById("task-form");
    if (form) form.addEventListener("submit", createTask);
}

async function createTask(event) {
    event.preventDefault();
    if (!currentUserIsAdmin) {
        showToast("Only admins can create tasks.", "warning");
        return;
    }

    const input = document.getElementById("task-input");
    const title = input.value.trim();
    if (!title) return;

    const today = getDateKey();
    const taskKey = normalizeTaskKey(title);

    const alreadyExists = allTasks.some((task) => task.dateKey === today && task.taskKey === taskKey);
    if (alreadyExists) {
        showToast("This task already exists today.", "warning");
        return;
    }

    if (membersCache.length === 0) {
        showToast("Approve at least one member first.", "warning");
        return;
    }

    try {
        const { collection, doc, runTransaction, serverTimestamp } = await getFirestoreModule();
        const rotationRef = doc(window.firebaseDB, "taskRotations", taskKey);
        const taskRef = doc(collection(window.firebaseDB, "tasks"));

        let assignedMember;

        await runTransaction(window.firebaseDB, async (transaction) => {
            const rotationDoc = await transaction.get(rotationRef);
            const memberIds = membersCache.map((m) => m.id);
            let usedIds = rotationDoc.exists() ? (rotationDoc.data().usedIds || []) : [];

            usedIds = usedIds.filter((id) => memberIds.includes(id));
            let available = membersCache.filter((m) => !usedIds.includes(m.id));

            if (available.length === 0) {
                available = [...membersCache];
                usedIds = [];
            }

            available.sort(() => Math.random() - 0.5);
            assignedMember = available[0];

            transaction.set(rotationRef, {
                taskKey: taskKey,
                usedIds: [...usedIds, assignedMember.id],
                updatedAt: serverTimestamp()
            }, { merge: true });

            transaction.set(taskRef, {
                title: title,
                taskKey: taskKey,
                dateKey: today,
                assignedTo: assignedMember.id,
                assignedName: assignedMember.name,
                completed: false,
                completedBy: null,
                completedAt: null,
                createdBy: currentUser.uid,
                createdAt: serverTimestamp()
            });
        });

        input.value = "";
        showToast(`"${title}" assigned to ${assignedMember.name}.`, "success");
    } catch (error) {
        console.error("Create task error:", error);
        showToast("Could not create task.", "error");
    }
}

function renderTasks() {
    const wrapper = document.getElementById("tasks-table-wrapper");
    if (!wrapper) return;

    const today = getDateKey();
    const todaysTasks = allTasks.filter((task) => task.dateKey === today);

    if (membersCache.length === 0) {
        wrapper.innerHTML = `<p class="loading-text">No approved members yet.</p>`;
        return;
    }

    if (todaysTasks.length === 0) {
        wrapper.innerHTML = `<p class="loading-text">No tasks assigned for today.</p>`;
        return;
    }

    todaysTasks.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    const table = document.createElement("table");
    table.className = "tasks-table";

    let theadHtml = `<thead><tr><th>Member</th>`;
    todaysTasks.forEach((t) => {
        theadHtml += `<th class="task-header">${t.title}</th>`;
    });
    theadHtml += `</tr></thead>`;

    let tbodyHtml = `<tbody>`;
    membersCache.forEach((member) => {
        tbodyHtml += `<tr><td class="member-name-cell">${member.name || "Member"}</td>`;
        todaysTasks.forEach((task) => {
            tbodyHtml += `<td class="task-cell">`;
            if (task.assignedTo !== member.id) {
                tbodyHtml += `<span class="task-empty">—</span>`;
            } else if (task.completed) {
                tbodyHtml += `<span class="task-done">✓ Done</span>`;
            } else if (member.id === currentUser.uid) {
                tbodyHtml += `<button class="task-complete-button" onclick="completeTask('${task.id}')">Complete</button>`;
            } else {
                tbodyHtml += `<span class="task-assigned">Assigned</span>`;
            }
            tbodyHtml += `</td>`;
        });
        tbodyHtml += `</tr>`;
    });
    tbodyHtml += `</tbody>`;

    table.innerHTML = theadHtml + tbodyHtml;
    wrapper.innerHTML = "";
    wrapper.appendChild(table);
}

window.completeTask = async function (taskId) {
    try {
        const { doc, updateDoc, serverTimestamp } = await getFirestoreModule();
        const task = allTasks.find((item) => item.id === taskId);

        if (!task || task.assignedTo !== currentUser.uid || task.completed) return;

        await updateDoc(doc(window.firebaseDB, "tasks", taskId), {
            completed: true,
            completedBy: currentUser.uid,
            completedAt: serverTimestamp()
        });
        showToast("Task marked as completed!", "success");
    } catch (error) {
        console.error("Complete task error:", error);
        showToast("Could not complete task.", "error");
    }
};

// EXPENSES
async function startExpenses() {
    if (expensesStarted) return;
    expensesStarted = true;

    const form = document.getElementById("expense-form");
    form.addEventListener("submit", addExpense);

    try {
        const { collection, query, orderBy, onSnapshot } = await getFirestoreModule();
        const expensesQuery = query(collection(window.firebaseDB, "expenses"), orderBy("createdAt", "desc"));

        onSnapshot(expensesQuery, (snapshot) => {
            allExpenses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            renderExpenseSummary();
            renderExpenseList();
        });
    } catch (error) {
        console.error("Expenses error:", error);
    }
}

function renderExpensePayerOptions() {
    const select = document.getElementById("expense-payer");
    if (!select) return;

    select.innerHTML = `<option value="">Who paid?</option>`;
    membersCache.forEach((member) => {
        const option = document.createElement("option");
        option.value = member.id;
        option.textContent = member.name || "Member";
        select.appendChild(option);
    });

    if (!currentUserIsAdmin) {
        select.value = currentUser.uid;
        select.disabled = true;
    } else {
        select.disabled = false;
    }
}

async function addExpense(event) {
    event.preventDefault();
    const category = document.getElementById("expense-category").value;
    const amount = Number(document.getElementById("expense-amount").value);
    const payer = document.getElementById("expense-payer").value;

    if (!category || !payer || !amount || amount <= 0) {
        showToast("Please fill all expense fields correctly.", "warning");
        return;
    }

    const payerMember = membersCache.find((m) => m.id === payer);
    if (!payerMember) return;

    try {
        const { collection, addDoc, serverTimestamp } = await getFirestoreModule();
        await addDoc(collection(window.firebaseDB, "expenses"), {
            category: category,
            amount: amount,
            paidBy: payer,
            paidByName: payerMember.name,
            monthKey: getMonthKey(),
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        });

        document.getElementById("expense-form").reset();
        renderExpensePayerOptions();
        showToast("Expense added successfully!", "success");
    } catch (error) {
        console.error("Add expense error:", error);
        showToast("Could not add expense.", "error");
    }
}

function renderExpenseSummary() {
    const summary = document.getElementById("expense-summary");
    if (!summary) return;

    if (membersCache.length === 0) {
        summary.innerHTML = `<p class="loading-text">Approve members first.</p>`;
        return;
    }

    const monthKey = getMonthKey();
    const monthlyExpenses = allExpenses.filter((e) => e.monthKey === monthKey);

    const total = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const bazarTotal = monthlyExpenses.filter((e) => e.category === "Bazar").reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const equalShare = membersCache.length > 0 ? total / membersCache.length : 0;

    const paidByMember = {};
    membersCache.forEach((m) => paidByMember[m.id] = 0);
    monthlyExpenses.forEach((e) => {
        if (paidByMember[e.paidBy] !== undefined) {
            paidByMember[e.paidBy] += Number(e.amount || 0);
        }
    });

    summary.innerHTML = "";
    summary.appendChild(createSummaryCard("Total Spending", formatMoney(total), `${monthlyExpenses.length} expense(s)`));
    summary.appendChild(createSummaryCard("Monthly Bazar", formatMoney(bazarTotal), "Bazar category only"));
    summary.appendChild(createSummaryCard("Equal Share", formatMoney(equalShare), "Per member"));

    // Settlement
    const settlement = document.createElement("div");
    settlement.className = "settlement-card";
    settlement.innerHTML = `<div class="settlement-title">Monthly Settlement</div>`;

    membersCache.forEach((member) => {
        const paid = paidByMember[member.id] || 0;
        const balance = paid - equalShare;
        const row = document.createElement("div");
        row.className = "settlement-row";

        let resultHtml = `<span>Equal</span>`;
        if (balance < -0.01) {
            resultHtml = `<span class="owes">Needs ${formatMoney(Math.abs(balance))} more</span>`;
        } else if (balance > 0.01) {
            resultHtml = `<span class="credit">${formatMoney(balance)} ahead</span>`;
        }

        row.innerHTML = `<span>${member.name}: ${formatMoney(paid)} paid</span> ${resultHtml}`;
        settlement.appendChild(row);
    });

    summary.appendChild(settlement);
}

function renderExpenseList() {
    const list = document.getElementById("expense-list");
    if (!list) return;

    const monthKey = getMonthKey();
    const monthly = allExpenses.filter((e) => e.monthKey === monthKey);

    list.innerHTML = "";
    if (monthly.length === 0) {
        list.innerHTML = `<p class="loading-text">No expenses this month.</p>`;
        return;
    }

    monthly.forEach((expense) => {
        const item = document.createElement("div");
        item.className = "expense-item";
        item.innerHTML = `
            <div class="expense-item-top">
                <span class="expense-item-category">${expense.category || "Other"}</span>
                <span class="expense-item-amount">${formatMoney(Number(expense.amount || 0))}</span>
            </div>
            <div class="expense-item-info">Paid by ${expense.paidByName || "Member"} • ${formatTimestamp(expense.createdAt)}</div>
        `;
        list.appendChild(item);
    });
}

// HELPERS & NAVIGATION
function setupNavigation() {
    const buttons = document.querySelectorAll("[data-target]");
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.dataset.target;
            const target = document.getElementById(targetId);
            if (!target) return;

            target.scrollIntoView({ behavior: "smooth", block: "start" });

            if (button.closest(".bottom-nav")) {
                document.querySelectorAll(".bottom-nav button").forEach((nav) => nav.classList.remove("active"));
                button.classList.add("active");
            }
        });
    });
}

function getDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getMonthKey() {
    return getDateKey().slice(0, 7);
}

function normalizeTaskKey(title) {
    return title.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^a-z0-9\s_-]/g, "").replace(/\s/g, "-");
}

function formatMoney(amount) {
    return `৳${Number(amount || 0).toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "Just now";
    try {
        return timestamp.toDate().toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return "Recently";
    }
}

function getInitial(name) {
    return name ? name.trim().charAt(0).toUpperCase() : "?";
}

function createSummaryCard(title, value, small) {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `
        <h4>${title}</h4>
        <div class="summary-value">${value}</div>
        <div class="summary-small">${small}</div>
    `;
    return card;
}