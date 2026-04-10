import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const CURRENCY = "EUR";

const els = {
  status: document.getElementById("status"),
  groupNameInput: document.getElementById("group-name-input"),
  myNameInput: document.getElementById("my-name-input"),
  copyShareLinkBtn: document.getElementById("copy-share-link-btn"),
  newMemberInput: document.getElementById("new-member-input"),
  addMemberBtn: document.getElementById("add-member-btn"),
  memberList: document.getElementById("member-list"),
  expenseForm: document.getElementById("expense-form"),
  expenseDescription: document.getElementById("expense-description"),
  expenseAmount: document.getElementById("expense-amount"),
  expensePayer: document.getElementById("expense-payer"),
  participantCheckboxes: document.getElementById("participant-checkboxes"),
  saveExpenseBtn: document.getElementById("save-expense-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  expenseList: document.getElementById("expense-list"),
  balancesList: document.getElementById("balances-list"),
  settlementsList: document.getElementById("settlements-list")
};

const state = {
  groupId: getOrCreateGroupId(),
  members: [],
  expenses: [],
  editingExpenseId: null,
  unsubMembers: null,
  unsubExpenses: null
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

init().catch((err) => {
  setStatus(`Greska pri inicijalizaciji: ${err.message}`, true);
  // eslint-disable-next-line no-console
  console.error(err);
});

async function init() {
  validateFirebaseConfig();
  wireEvents();
  await ensureGroupExists();
  await loadGroupMeta();
  subscribeMembers();
  subscribeExpenses();
  setStatus("Aplikacija je spremna.");
}

function validateFirebaseConfig() {
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes("YOUR_")) {
    throw new Error("Popuni firebase-config.js prije pokretanja.");
  }
}

function wireEvents() {
  els.copyShareLinkBtn.addEventListener("click", copyShareLink);
  els.addMemberBtn.addEventListener("click", addMemberFromInput);
  els.newMemberInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMemberFromInput();
    }
  });

  let saveTimer;
  els.groupNameInput.addEventListener("input", async () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(updateGroupName, 300);
  });

  els.myNameInput.addEventListener("input", () => {
    localStorage.setItem("split-my-name", els.myNameInput.value.trim());
  });

  els.expenseForm.addEventListener("submit", upsertExpense);
  els.cancelEditBtn.addEventListener("click", resetExpenseForm);
}

function getOrCreateGroupId() {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash) {
    return hash;
  }

  const generated = crypto.randomUUID().replace(/-/g, "").slice(0, 14);
  window.location.hash = generated;
  return generated;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? "#a4161a" : "#2d6a4f";
}

function groupDocRef() {
  return doc(db, "groups", state.groupId);
}

function membersCollectionRef() {
  return collection(db, "groups", state.groupId, "members");
}

function expensesCollectionRef() {
  return collection(db, "groups", state.groupId, "expenses");
}

async function ensureGroupExists() {
  const ref = groupDocRef();
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: "Nova grupa",
      currency: CURRENCY,
      createdAt: serverTimestamp()
    });
  }
}

async function loadGroupMeta() {
  const snap = await getDoc(groupDocRef());
  const data = snap.data() ?? {};
  els.groupNameInput.value = data.name ?? "Nova grupa";
  els.myNameInput.value = localStorage.getItem("split-my-name") ?? "";
}

async function updateGroupName() {
  const newName = els.groupNameInput.value.trim() || "Nova grupa";
  try {
    await updateDoc(groupDocRef(), { name: newName });
    setStatus("Naziv grupe je spremljen.");
  } catch (err) {
    setStatus(`Spremanje naziva nije uspjelo: ${err.message}`, true);
  }
}

async function copyShareLink() {
  const shareLink = `${window.location.origin}${window.location.pathname}#${state.groupId}`;
  try {
    await navigator.clipboard.writeText(shareLink);
    setStatus("Share link je kopiran.");
  } catch {
    setStatus("Clipboard nije dostupan. Link je u URL-u preglednika.");
  }
}

async function addMemberFromInput() {
  const name = els.newMemberInput.value.trim();
  if (!name) {
    setStatus("Unesi ime clana.", true);
    return;
  }

  const exists = state.members.some((m) => m.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    setStatus("Clan s tim imenom vec postoji.", true);
    return;
  }

  try {
    await addDoc(membersCollectionRef(), {
      name,
      createdAt: serverTimestamp()
    });
    els.newMemberInput.value = "";
    setStatus(`Clan ${name} je dodan.`);
  } catch (err) {
    setStatus(`Dodavanje clana nije uspjelo: ${err.message}`, true);
  }
}

function subscribeMembers() {
  state.unsubMembers?.();
  const q = query(membersCollectionRef(), orderBy("createdAt", "asc"));

  state.unsubMembers = onSnapshot(
    q,
    (snapshot) => {
      state.members = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderMembers();
      renderPayerOptions();
      renderParticipantCheckboxes();
      renderBalancesAndSettlements();
    },
    (err) => setStatus(`Greska pri dohvatu clanova: ${err.message}`, true)
  );
}

function subscribeExpenses() {
  state.unsubExpenses?.();
  const q = query(expensesCollectionRef(), orderBy("createdAt", "desc"));

  state.unsubExpenses = onSnapshot(
    q,
    (snapshot) => {
      state.expenses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderExpenses();
      renderBalancesAndSettlements();
    },
    (err) => setStatus(`Greska pri dohvatu troskova: ${err.message}`, true)
  );
}

function renderMembers() {
  els.memberList.innerHTML = "";

  if (state.members.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nema clanova. Dodaj barem jednog.";
    els.memberList.appendChild(li);
    return;
  }

  state.members.forEach((member) => {
    const li = document.createElement("li");
    li.className = "chip";
    li.innerHTML = `<span>${escapeHtml(member.name)}</span>`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "icon-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "X";
    removeBtn.title = "Obrisi clana";
    removeBtn.addEventListener("click", () => deleteMember(member.id, member.name));

    li.appendChild(removeBtn);
    els.memberList.appendChild(li);
  });
}

function renderPayerOptions() {
  const current = els.expensePayer.value;
  els.expensePayer.innerHTML = "";

  state.members.forEach((member) => {
    const option = document.createElement("option");
    option.value = member.id;
    option.textContent = member.name;
    els.expensePayer.appendChild(option);
  });

  if (!state.members.some((m) => m.id === current) && state.members.length > 0) {
    els.expensePayer.value = state.members[0].id;
  } else {
    els.expensePayer.value = current;
  }
}

function renderParticipantCheckboxes() {
  const selected = new Set(getSelectedParticipantIds());
  els.participantCheckboxes.innerHTML = "";

  state.members.forEach((member) => {
    const wrapper = document.createElement("label");
    wrapper.className = "checkbox-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = member.id;
    checkbox.checked = selected.size === 0 ? true : selected.has(member.id);

    const span = document.createElement("span");
    span.textContent = member.name;

    wrapper.append(checkbox, span);
    els.participantCheckboxes.appendChild(wrapper);
  });
}

function getSelectedParticipantIds() {
  return Array.from(els.participantCheckboxes.querySelectorAll("input[type='checkbox']:checked")).map(
    (cb) => cb.value
  );
}

async function upsertExpense(e) {
  e.preventDefault();

  const description = els.expenseDescription.value.trim();
  const amount = Number(els.expenseAmount.value);
  const payerMemberId = els.expensePayer.value;
  const participantMemberIds = getSelectedParticipantIds();

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    setStatus("Opis i pozitivan iznos su obavezni.", true);
    return;
  }

  if (!payerMemberId) {
    setStatus("Odaberi clana koji je platio.", true);
    return;
  }

  if (participantMemberIds.length === 0) {
    setStatus("Odaberi barem jednog sudionika.", true);
    return;
  }

  const payload = {
    description,
    amount: Number(amount.toFixed(2)),
    payerMemberId,
    participantMemberIds,
    updatedAt: serverTimestamp(),
    createdByName: els.myNameInput.value.trim() || "Anonimno"
  };

  try {
    if (state.editingExpenseId) {
      await updateDoc(doc(db, "groups", state.groupId, "expenses", state.editingExpenseId), payload);
      setStatus("Trosak je azuriran.");
    } else {
      await addDoc(expensesCollectionRef(), { ...payload, createdAt: serverTimestamp() });
      setStatus("Trosak je dodan.");
    }

    resetExpenseForm();
  } catch (err) {
    setStatus(`Spremanje troska nije uspjelo: ${err.message}`, true);
  }
}

function resetExpenseForm() {
  state.editingExpenseId = null;
  els.expenseForm.reset();
  els.saveExpenseBtn.textContent = "Spremi trosak";
  els.cancelEditBtn.classList.add("hidden");
  renderParticipantCheckboxes();
}

function renderExpenses() {
  els.expenseList.innerHTML = "";

  if (state.expenses.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Jos nema troskova.";
    els.expenseList.appendChild(li);
    return;
  }

  state.expenses.forEach((expense) => {
    const payerName = memberNameById(expense.payerMemberId);
    const participants = (expense.participantMemberIds || []).map(memberNameById).join(", ");

    const li = document.createElement("li");
    li.className = "expense-item";
    li.innerHTML = `
      <div class="expense-main">
        <strong>${escapeHtml(expense.description)}</strong>
        <strong>${formatMoney(expense.amount)}</strong>
      </div>
      <div class="expense-sub">Platio: ${escapeHtml(payerName)} | Dijeli se na: ${escapeHtml(participants)}</div>
      <div class="expense-sub">Unio: ${escapeHtml(expense.createdByName || "Anonimno")}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "expense-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "small-btn";
    editBtn.type = "button";
    editBtn.textContent = "Uredi";
    editBtn.addEventListener("click", () => startEditExpense(expense.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "small-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Obrisi";
    deleteBtn.addEventListener("click", () => deleteExpense(expense.id));

    actions.append(editBtn, deleteBtn);
    li.appendChild(actions);
    els.expenseList.appendChild(li);
  });
}

function startEditExpense(expenseId) {
  const expense = state.expenses.find((e) => e.id === expenseId);
  if (!expense) {
    return;
  }

  state.editingExpenseId = expenseId;
  els.expenseDescription.value = expense.description;
  els.expenseAmount.value = expense.amount;
  els.expensePayer.value = expense.payerMemberId;
  renderParticipantCheckboxes();

  const selected = new Set(expense.participantMemberIds || []);
  els.participantCheckboxes.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.checked = selected.has(cb.value);
  });

  els.saveExpenseBtn.textContent = "Spremi izmjenu";
  els.cancelEditBtn.classList.remove("hidden");
}

async function deleteExpense(expenseId) {
  try {
    await deleteDoc(doc(db, "groups", state.groupId, "expenses", expenseId));
    if (state.editingExpenseId === expenseId) {
      resetExpenseForm();
    }
    setStatus("Trosak je obrisan.");
  } catch (err) {
    setStatus(`Brisanje troska nije uspjelo: ${err.message}`, true);
  }
}

async function deleteMember(memberId, memberName) {
  const isUsed = state.expenses.some(
    (expense) =>
      expense.payerMemberId === memberId || (expense.participantMemberIds || []).includes(memberId)
  );

  if (isUsed) {
    setStatus("Ne mozes obrisati clana koji postoji u troskovima.", true);
    return;
  }

  try {
    await deleteDoc(doc(db, "groups", state.groupId, "members", memberId));
    setStatus(`Clan ${memberName} je obrisan.`);
  } catch (err) {
    setStatus(`Brisanje clana nije uspjelo: ${err.message}`, true);
  }
}

function renderBalancesAndSettlements() {
  els.balancesList.innerHTML = "";
  els.settlementsList.innerHTML = "";

  if (state.members.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Dodaj clanove za izracun salda.";
    els.balancesList.appendChild(li);
    return;
  }

  const balanceByMember = new Map(state.members.map((m) => [m.id, 0]));

  state.expenses.forEach((expense) => {
    const participantIds = expense.participantMemberIds || [];
    if (participantIds.length === 0) {
      return;
    }

    const share = expense.amount / participantIds.length;

    participantIds.forEach((memberId) => {
      balanceByMember.set(memberId, (balanceByMember.get(memberId) || 0) - share);
    });

    balanceByMember.set(
      expense.payerMemberId,
      (balanceByMember.get(expense.payerMemberId) || 0) + expense.amount
    );
  });

  state.members.forEach((member) => {
    const balance = round2(balanceByMember.get(member.id) || 0);
    const li = document.createElement("li");
    li.className = "balance-item";

    if (Math.abs(balance) < 0.01) {
      li.textContent = `${member.name}: 0.00 ${CURRENCY}`;
    } else if (balance > 0) {
      li.textContent = `${member.name} treba dobiti ${formatMoney(balance)}`;
    } else {
      li.textContent = `${member.name} treba platiti ${formatMoney(Math.abs(balance))}`;
    }

    els.balancesList.appendChild(li);
  });

  const settlements = calculateSettlements(balanceByMember);

  if (settlements.length === 0) {
    const li = document.createElement("li");
    li.className = "settlement-item";
    li.textContent = "Nema potrebe za poravnanjem.";
    els.settlementsList.appendChild(li);
    return;
  }

  settlements.forEach((s) => {
    const li = document.createElement("li");
    li.className = "settlement-item";
    li.textContent = `${s.from} -> ${s.to}: ${formatMoney(s.amount)}`;
    els.settlementsList.appendChild(li);
  });
}

function calculateSettlements(balanceByMember) {
  const debtors = [];
  const creditors = [];

  state.members.forEach((member) => {
    const balance = round2(balanceByMember.get(member.id) || 0);
    if (balance < -0.01) {
      debtors.push({ member, amount: Math.abs(balance) });
    } else if (balance > 0.01) {
      creditors.push({ member, amount: balance });
    }
  });

  const settlements = [];
  let debtorIdx = 0;
  let creditorIdx = 0;

  while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
    const debtor = debtors[debtorIdx];
    const creditor = creditors[creditorIdx];
    const transfer = round2(Math.min(debtor.amount, creditor.amount));

    settlements.push({ from: debtor.member.name, to: creditor.member.name, amount: transfer });

    debtor.amount = round2(debtor.amount - transfer);
    creditor.amount = round2(creditor.amount - transfer);

    if (debtor.amount <= 0.01) {
      debtorIdx += 1;
    }
    if (creditor.amount <= 0.01) {
      creditorIdx += 1;
    }
  }

  return settlements;
}

function memberNameById(id) {
  return state.members.find((m) => m.id === id)?.name ?? "Nepoznat clan";
}

function formatMoney(value) {
  return `${round2(value).toFixed(2)} ${CURRENCY}`;
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
