import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
  myNameInput: document.getElementById("my-name-input"),

  menuView: document.getElementById("menu-view"),
  groupView: document.getElementById("group-view"),

  groupSelect: document.getElementById("group-select"),
  enterGroupBtn: document.getElementById("enter-group-btn"),
  newGroupNameInput: document.getElementById("new-group-name-input"),
  addGroupBtn: document.getElementById("add-group-btn"),

  newMemberInput: document.getElementById("new-member-input"),
  addMemberBtn: document.getElementById("add-member-btn"),
  memberList: document.getElementById("member-list"),

  activeGroupTitle: document.getElementById("active-group-title"),
  backToMenuBtn: document.getElementById("back-to-menu-btn"),
  copyShareLinkBtn: document.getElementById("copy-share-link-btn"),

  expenseForm: document.getElementById("expense-form"),
  expenseDescription: document.getElementById("expense-description"),
  expenseAmount: document.getElementById("expense-amount"),
  payersPicker: document.getElementById("payers-picker"),
  participantsPicker: document.getElementById("participants-picker"),
  saveExpenseBtn: document.getElementById("save-expense-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),

  expenseList: document.getElementById("expense-list"),
  balancesList: document.getElementById("balances-list"),
  settlementsList: document.getElementById("settlements-list")
};

const state = {
  pendingGroupIdFromHash: getHashGroupId(),
  selectedGroupId: null,
  groups: [],
  members: [],
  expenses: [],
  editingExpenseId: null,
  selectedPayerIds: new Set(),
  selectedParticipantIds: new Set(),
  unsubGroups: null,
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
  els.myNameInput.value = localStorage.getItem("split-my-name") ?? "";
  subscribeGroups();
  setStatus("Aplikacija je spremna.");
}

function validateFirebaseConfig() {
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes("YOUR_")) {
    throw new Error("Popuni firebase-config.js prije pokretanja.");
  }
}

function wireEvents() {
  els.myNameInput.addEventListener("input", () => {
    localStorage.setItem("split-my-name", els.myNameInput.value.trim());
  });

  els.groupSelect.addEventListener("change", () => {
    setSelectedGroup(els.groupSelect.value, { enterGroupView: false });
  });

  els.enterGroupBtn.addEventListener("click", () => {
    if (!state.selectedGroupId) {
      setStatus("Prvo odaberi grupu.", true);
      return;
    }
    openGroupView();
  });

  els.addGroupBtn.addEventListener("click", addGroupFromInput);
  els.newGroupNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGroupFromInput();
    }
  });

  els.addMemberBtn.addEventListener("click", addMemberFromInput);
  els.newMemberInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMemberFromInput();
    }
  });

  els.backToMenuBtn.addEventListener("click", openMenuView);
  els.copyShareLinkBtn.addEventListener("click", copyShareLink);

  els.expenseForm.addEventListener("submit", upsertExpense);
  els.cancelEditBtn.addEventListener("click", resetExpenseForm);

  els.payersPicker.addEventListener("click", (e) => togglePickerSelection(e, "payer"));
  els.participantsPicker.addEventListener("click", (e) => togglePickerSelection(e, "participant"));
}

function groupsCollectionRef() {
  return collection(db, "groups");
}

function groupDocRef(groupId = state.selectedGroupId) {
  return doc(db, "groups", groupId);
}

function membersCollectionRef(groupId = state.selectedGroupId) {
  return collection(db, "groups", groupId, "members");
}

function expensesCollectionRef(groupId = state.selectedGroupId) {
  return collection(db, "groups", groupId, "expenses");
}

function subscribeGroups() {
  state.unsubGroups?.();

  const q = query(groupsCollectionRef(), orderBy("createdAt", "asc"));
  state.unsubGroups = onSnapshot(
    q,
    async (snapshot) => {
      state.groups = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (state.groups.length === 0) {
        const initialId = state.pendingGroupIdFromHash || null;
        await createGroup(initialId, "Prva grupa");
        return;
      }

      resolveSelectedGroupAfterGroupsUpdate();
      renderGroupSelect();
      renderActiveGroupTitle();
    },
    (err) => setStatus(`Greska pri dohvatu grupa: ${err.message}`, true)
  );
}

function resolveSelectedGroupAfterGroupsUpdate() {
  const validIds = new Set(state.groups.map((g) => g.id));

  if (state.pendingGroupIdFromHash) {
    if (validIds.has(state.pendingGroupIdFromHash)) {
      setSelectedGroup(state.pendingGroupIdFromHash, { enterGroupView: true });
      state.pendingGroupIdFromHash = null;
      return;
    }

    createGroup(state.pendingGroupIdFromHash, "Podijeljena grupa").catch((err) => {
      setStatus(`Kreiranje dijeljene grupe nije uspjelo: ${err.message}`, true);
    });
    state.pendingGroupIdFromHash = null;
    return;
  }

  if (state.selectedGroupId && validIds.has(state.selectedGroupId)) {
    return;
  }

  setSelectedGroup(state.groups[0].id, { enterGroupView: false });
}

function renderGroupSelect() {
  const current = state.selectedGroupId;
  els.groupSelect.innerHTML = "";

  state.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name || "Bez naziva";
    els.groupSelect.appendChild(option);
  });

  if (current && state.groups.some((g) => g.id === current)) {
    els.groupSelect.value = current;
  }
}

function renderActiveGroupTitle() {
  const group = state.groups.find((g) => g.id === state.selectedGroupId);
  els.activeGroupTitle.textContent = group?.name ? `Grupa: ${group.name}` : "Grupa";
}

async function createGroup(groupId = null, name = "Nova grupa") {
  const groupName = name.trim() || "Nova grupa";

  if (groupId) {
    await setDoc(groupDocRef(groupId), {
      name: groupName,
      currency: CURRENCY,
      createdAt: serverTimestamp()
    });
    setSelectedGroup(groupId, { enterGroupView: false });
    return;
  }

  const docRef = await addDoc(groupsCollectionRef(), {
    name: groupName,
    currency: CURRENCY,
    createdAt: serverTimestamp()
  });

  setSelectedGroup(docRef.id, { enterGroupView: false });
}

async function addGroupFromInput() {
  const name = els.newGroupNameInput.value.trim();
  if (!name) {
    setStatus("Upisi naziv nove grupe.", true);
    return;
  }

  try {
    await createGroup(null, name);
    els.newGroupNameInput.value = "";
    setStatus(`Grupa ${name} je kreirana.`);
  } catch (err) {
    setStatus(`Kreiranje grupe nije uspjelo: ${err.message}`, true);
  }
}

function setSelectedGroup(groupId, { enterGroupView = false } = {}) {
  if (!groupId || groupId === state.selectedGroupId) {
    if (enterGroupView && groupId) {
      openGroupView();
    }
    return;
  }

  state.selectedGroupId = groupId;
  state.editingExpenseId = null;
  state.selectedPayerIds = new Set();
  state.selectedParticipantIds = new Set();
  els.groupSelect.value = groupId;

  window.location.hash = groupId;
  subscribeMembers();
  subscribeExpenses();
  renderActiveGroupTitle();

  if (enterGroupView) {
    openGroupView();
  }
}

function openGroupView() {
  els.menuView.classList.add("hidden");
  els.groupView.classList.remove("hidden");
  renderActiveGroupTitle();
}

function openMenuView() {
  els.groupView.classList.add("hidden");
  els.menuView.classList.remove("hidden");
}

function getHashGroupId() {
  return window.location.hash.replace("#", "").trim() || null;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? "#a4161a" : "#2d6a4f";
}

function subscribeMembers() {
  state.unsubMembers?.();
  state.members = [];

  if (!state.selectedGroupId) {
    renderMembers();
    renderMemberPickers();
    return;
  }

  const q = query(membersCollectionRef(), orderBy("createdAt", "asc"));

  state.unsubMembers = onSnapshot(
    q,
    (snapshot) => {
      state.members = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderMembers();
      renderMemberPickers();
      renderBalancesAndSettlements();
    },
    (err) => setStatus(`Greska pri dohvatu clanova: ${err.message}`, true)
  );
}

function subscribeExpenses() {
  state.unsubExpenses?.();
  state.expenses = [];

  if (!state.selectedGroupId) {
    renderExpenses();
    renderBalancesAndSettlements();
    return;
  }

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

async function addMemberFromInput() {
  if (!state.selectedGroupId) {
    setStatus("Prvo kreiraj i odaberi grupu.", true);
    return;
  }

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

function renderMembers() {
  els.memberList.innerHTML = "";

  if (!state.selectedGroupId) {
    const li = document.createElement("li");
    li.textContent = "Prvo odaberi grupu.";
    els.memberList.appendChild(li);
    return;
  }

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

function renderMemberPickers() {
  const memberIds = new Set(state.members.map((m) => m.id));

  state.selectedPayerIds = new Set([...state.selectedPayerIds].filter((id) => memberIds.has(id)));
  state.selectedParticipantIds = new Set(
    [...state.selectedParticipantIds].filter((id) => memberIds.has(id))
  );

  if (state.selectedPayerIds.size === 0 && state.members.length > 0) {
    state.selectedPayerIds.add(state.members[0].id);
  }

  if (state.selectedParticipantIds.size === 0 && state.members.length > 0) {
    state.members.forEach((m) => state.selectedParticipantIds.add(m.id));
  }

  renderPicker(els.payersPicker, state.selectedPayerIds, "Nema clanova za odabir.");
  renderPicker(els.participantsPicker, state.selectedParticipantIds, "Nema clanova za odabir.");
}

function renderPicker(container, activeSet, emptyText) {
  container.innerHTML = "";

  if (state.members.length === 0) {
    const p = document.createElement("p");
    p.className = "picker-empty";
    p.textContent = emptyText;
    container.appendChild(p);
    return;
  }

  state.members.forEach((member) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-btn";
    if (activeSet.has(member.id)) {
      btn.classList.add("active");
    }
    btn.dataset.memberId = member.id;
    btn.textContent = member.name;
    container.appendChild(btn);
  });
}

function togglePickerSelection(event, role) {
  const button = event.target.closest("button[data-member-id]");
  if (!button) {
    return;
  }

  const memberId = button.dataset.memberId;
  const targetSet = role === "payer" ? state.selectedPayerIds : state.selectedParticipantIds;

  if (targetSet.has(memberId)) {
    targetSet.delete(memberId);
    button.classList.remove("active");
  } else {
    targetSet.add(memberId);
    button.classList.add("active");
  }
}

async function copyShareLink() {
  if (!state.selectedGroupId) {
    setStatus("Nema aktivne grupe za dijeljenje.", true);
    return;
  }

  const shareLink = `${window.location.origin}${window.location.pathname}#${state.selectedGroupId}`;
  try {
    await navigator.clipboard.writeText(shareLink);
    setStatus("Share link je kopiran.");
  } catch {
    setStatus("Clipboard nije dostupan. Link je u URL-u preglednika.");
  }
}

async function upsertExpense(e) {
  e.preventDefault();

  if (!state.selectedGroupId) {
    setStatus("Prvo odaberi grupu.", true);
    return;
  }

  const description = els.expenseDescription.value.trim();
  const amount = Number(els.expenseAmount.value);
  const payerMemberIds = [...state.selectedPayerIds];
  const participantMemberIds = [...state.selectedParticipantIds];

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    setStatus("Opis i pozitivan iznos su obavezni.", true);
    return;
  }

  if (payerMemberIds.length === 0) {
    setStatus("Odaberi barem jednog platioca lijevo.", true);
    return;
  }

  if (participantMemberIds.length === 0) {
    setStatus("Odaberi barem jednog sudionika desno.", true);
    return;
  }

  const payload = {
    description,
    amount: Number(amount.toFixed(2)),
    payerMemberIds,
    participantMemberIds,
    updatedAt: serverTimestamp(),
    createdByName: els.myNameInput.value.trim() || "Anonimno"
  };

  try {
    if (state.editingExpenseId) {
      await updateDoc(doc(db, "groups", state.selectedGroupId, "expenses", state.editingExpenseId), payload);
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

  state.selectedPayerIds = new Set();
  state.selectedParticipantIds = new Set();
  renderMemberPickers();
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
    const payerNames = getMemberNames(expense.payerMemberIds || []);
    const participantNames = getMemberNames(expense.participantMemberIds || []);

    const li = document.createElement("li");
    li.className = "expense-item";
    li.innerHTML = `
      <div class="expense-main">
        <strong>${escapeHtml(expense.description)}</strong>
        <strong>${formatMoney(expense.amount)}</strong>
      </div>
      <div class="expense-sub">Platili: ${escapeHtml(payerNames.join(", "))}</div>
      <div class="expense-sub">Podjela na: ${escapeHtml(participantNames.join(", "))}</div>
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
  els.saveExpenseBtn.textContent = "Spremi izmjenu";
  els.cancelEditBtn.classList.remove("hidden");

  state.selectedPayerIds = new Set(expense.payerMemberIds || []);
  state.selectedParticipantIds = new Set(expense.participantMemberIds || []);
  renderMemberPickers();
}

async function deleteExpense(expenseId) {
  try {
    await deleteDoc(doc(db, "groups", state.selectedGroupId, "expenses", expenseId));
    if (state.editingExpenseId === expenseId) {
      resetExpenseForm();
    }
    setStatus("Trosak je obrisan.");
  } catch (err) {
    setStatus(`Brisanje troska nije uspjelo: ${err.message}`, true);
  }
}

async function deleteMember(memberId, memberName) {
  const isUsed = state.expenses.some((expense) => {
    const payers = expense.payerMemberIds || [];
    const participants = expense.participantMemberIds || [];
    return payers.includes(memberId) || participants.includes(memberId);
  });

  if (isUsed) {
    setStatus("Ne mozes obrisati clana koji postoji u troskovima.", true);
    return;
  }

  try {
    await deleteDoc(doc(db, "groups", state.selectedGroupId, "members", memberId));
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
    const participants = expense.participantMemberIds || [];
    const payers = expense.payerMemberIds || [];

    if (participants.length === 0 || payers.length === 0) {
      return;
    }

    const participantShare = expense.amount / participants.length;
    const payerShare = expense.amount / payers.length;

    participants.forEach((memberId) => {
      balanceByMember.set(memberId, (balanceByMember.get(memberId) || 0) - participantShare);
    });

    payers.forEach((memberId) => {
      balanceByMember.set(memberId, (balanceByMember.get(memberId) || 0) + payerShare);
    });
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

function getMemberNames(ids) {
  return ids.map((id) => state.members.find((m) => m.id === id)?.name ?? "Nepoznat clan");
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
