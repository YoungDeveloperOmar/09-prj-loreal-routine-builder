/* ============================================================
   DOM REFERENCES
   ============================================================ */
const categoryPills    = document.getElementById("categoryPills");
const productSearch    = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const chatForm         = document.getElementById("chatForm");
const chatWindow       = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn   = document.getElementById("generateRoutine");
const clearSelectedBtn     = document.getElementById("clearSelected");
const userInput        = document.getElementById("userInput");
const sendBtn          = document.getElementById("sendBtn");
const typingIndicator  = document.getElementById("typingIndicator");
const copyRoutineBtn   = document.getElementById("copyRoutineBtn");
const selectionCount   = document.getElementById("selectionCount");
const skinTypePills    = document.getElementById("skinTypePills");
const toastContainer   = document.getElementById("toastContainer");

/* ============================================================
   APP STATE
   ============================================================ */
const STORAGE_KEY = "lorealSelectedProducts";

/* Use the Cloudflare Worker URL from secrets.js, or fall back to default */
const WORKER_URL =
  window.CLOUDFLARE_WORKER_URL ||
  window.WORKER_URL ||
  "https://api-worker.rk4b2rt5k6.workers.dev/";

const SYSTEM_PROMPT = `
You are a L'Oréal Smart Routine & Product Advisor.

Rules:
- Stay focused only on beauty topics such as skincare, haircare, makeup, fragrance, and grooming.
- When generating a routine, use ONLY the selected products provided. Do not invent products.
- For follow-up questions, remember the earlier conversation and routine.
- If the user asks something unrelated, briefly redirect them back to product or routine questions.
- Use clear formatting: use headers (##) for sections, bullet points (-) for steps, and bold (**) for product names.
- Keep answers friendly, concise, and practical.
`.trim();

let allProducts = [];
let selectedProductIds = new Set(loadSavedSelections());
let conversationHistory = [];
let routineGenerated = false;
let lastRoutineText = "";     /* used by the Copy button */
let currentCategory = null;  /* currently active category pill value */
let selectedSkinType = null; /* user's selected skin type */

/* ============================================================
   LOCAL STORAGE HELPERS
   ============================================================ */
function loadSavedSelections() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function saveSelectedProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedProductIds]));
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

/* Show a short pop-up notification at the bottom of the screen */
function showToast(message, type = "default") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  /* Remove the element after the CSS animation finishes (2.8s total) */
  setTimeout(() => toast.remove(), 2900);
}

/* ============================================================
   MARKDOWN RENDERER
   Converts the AI response (which uses basic Markdown) into HTML
   so bullet points, bold text, and headers display correctly.
   ============================================================ */
function renderMarkdown(text) {
  /* Step 1: Escape HTML so raw tags are not injected */
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  /* Step 2: Walk through each line and wrap it in the right element */
  const lines = escaped.split("\n");
  const output = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    /* H2 heading: ## Heading */
    if (/^## (.+)/.test(line)) {
      closeList();
      output.push(`<h3>${line.slice(3)}</h3>`);

    /* H3 heading: ### Heading */
    } else if (/^### (.+)/.test(line)) {
      closeList();
      output.push(`<h4>${line.slice(4)}</h4>`);

    /* Unordered list: - Item */
    } else if (/^- (.+)/.test(line)) {
      if (inOl) { output.push("</ol>"); inOl = false; }
      if (!inUl) { output.push("<ul>"); inUl = true; }
      output.push(`<li>${line.slice(2)}</li>`);

    /* Ordered list: 1. Item */
    } else if (/^\d+\. (.+)/.test(line)) {
      if (inUl) { output.push("</ul>"); inUl = false; }
      if (!inOl) { output.push("<ol>"); inOl = true; }
      output.push(`<li>${line.replace(/^\d+\. /, "")}</li>`);

    /* Blank line — close any open list, add spacing */
    } else if (line.trim() === "") {
      closeList();
      output.push(`<br>`);

    /* Normal paragraph line */
    } else {
      closeList();
      output.push(`<p>${line}</p>`);
    }
  }

  /* Close any list that was still open */
  closeList();

  /* Helper defined here to access the outer arrays */
  function closeList() {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  }

  /* Step 3: Apply inline formatting (bold, italic) */
  return output
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

/* ============================================================
   CHAT HELPERS
   ============================================================ */

/* Add a chat bubble to the conversation window */
function appendMessage(role, text) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;

  if (role === "assistant") {
    /* Render markdown so AI responses look properly formatted */
    message.innerHTML = renderMarkdown(text);
  } else {
    /* User messages: plain escaped text */
    message.textContent = text;
  }

  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Show the animated typing indicator while waiting for the AI */
function showTyping() {
  typingIndicator.style.display = "flex";
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  typingIndicator.style.display = "none";
}

/* ============================================================
   PRODUCT HELPERS
   ============================================================ */

/* Return full product objects for every selected id */
function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

/* Re-render the "Your Selection" chip list and update the count badge */
function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();
  const count = selectedProducts.length;

  /* Update count badge */
  selectionCount.textContent = count;
  selectionCount.style.background = count > 0 ? "#000" : "#ccc";

  /* Enable/disable Clear All button */
  clearSelectedBtn.disabled = count === 0;

  if (count === 0) {
    selectedProductsList.innerHTML = `
      <span class="selected-placeholder">No products selected yet</span>
    `;
    return;
  }

  /* Build the chip list */
  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-item">
          <span>${escapeHtml(product.brand)} – ${escapeHtml(product.name)}</span>
          <button class="remove-selected" data-id="${product.id}" type="button" title="Remove">
            &times;
          </button>
        </div>
      `
    )
    .join("");
}

/* Escape HTML to prevent XSS when inserting text into the DOM */
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ============================================================
   DISPLAY PRODUCTS
   Creates portrait product cards and inserts them into the grid
   ============================================================ */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>No products found</p>
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);

      return `
        <div class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}">
          <div class="card-image">
            <img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy">
          </div>
          <div class="card-body">
            <div class="card-brand">${escapeHtml(product.brand)}</div>
            <h3 class="card-name">${escapeHtml(product.name)}</h3>
            <details class="product-description">
              <summary>Details</summary>
              <p>${escapeHtml(product.description)}</p>
            </details>
            <div class="card-select-row">
              <div class="card-select-icon">
                ${isSelected ? '<i class="fa-solid fa-check"></i>' : ""}
              </div>
              ${isSelected ? "Selected" : "Add to Routine"}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

/* ============================================================
   FILTERED VIEW HELPER
   Applies both the active category and the search text
   ============================================================ */
function applyFilters() {
  const query = productSearch.value.trim().toLowerCase();

  /* If no category is selected and no search query, show the initial prompt */
  if (currentCategory === null && !query) {
    productsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-spa"></i>
        <p>Select a category to browse products</p>
      </div>
    `;
    return;
  }

  let filtered = allProducts;

  /* Filter by category if one is selected */
  if (currentCategory !== null && currentCategory !== "") {
    filtered = filtered.filter((p) => p.category === currentCategory);
  }

  /* Further filter by search text */
  if (query) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query)
    );
  }

  displayProducts(filtered);
}

/* ============================================================
   CLOUDFLARE WORKER API CALL
   ============================================================ */

/* Parse the AI reply from whichever shape the Worker returns */
function extractReply(data) {
  if (typeof data.reply === "string") return data.reply;
  if (typeof data.response === "string") return data.response;
  if (typeof data.output_text === "string") return data.output_text;

  if (typeof data?.choices?.[0]?.message?.content === "string") {
    return data.choices[0].message.content;
  }

  if (Array.isArray(data?.choices?.[0]?.message?.content)) {
    return data.choices[0].message.content
      .map((item) => item.text || "")
      .join("\n")
      .trim();
  }

  return "I received a response but could not read it. Please try again.";
}

async function getAIResponse(messages) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });

  if (!response.ok) {
    throw new Error(`Worker returned ${response.status}`);
  }

  const data = await response.json();
  return extractReply(data);
}

/* ============================================================
   LOAD PRODUCTS
   ============================================================ */
async function loadProducts() {
  const response = await fetch("products.json");
  if (!response.ok) {
    throw new Error(`Failed to load products (${response.status})`);
  }
  const data = await response.json();
  return data.products;
}

/* ============================================================
   EVENT: Category pills
   ============================================================ */
categoryPills.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;

  /* Update active state */
  categoryPills
    .querySelectorAll(".pill")
    .forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");

  /* Store and apply the selected category */
  currentCategory = pill.dataset.category;
  applyFilters();
});

/* ============================================================
   EVENT: Live search
   ============================================================ */
productSearch.addEventListener("input", () => {
  applyFilters();
});

/* ============================================================
   EVENT: Select / deselect a product card
   ============================================================ */
productsContainer.addEventListener("click", (e) => {
  /* Let clicks on the description toggle through without selecting */
  if (e.target.closest("details") || e.target.closest("summary")) return;

  const card = e.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.id);
  const product = allProducts.find((p) => p.id === productId);

  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
    showToast(`Removed: ${product.name}`, "removed");
  } else {
    selectedProductIds.add(productId);
    showToast(`Added: ${product.name}`, "added");
  }

  saveSelectedProducts();
  renderSelectedProducts();
  applyFilters(); /* re-render cards so the selection state updates */
});

/* ============================================================
   EVENT: Remove a product from the selection panel
   ============================================================ */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-selected");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.id);
  selectedProductIds.delete(productId);
  saveSelectedProducts();
  renderSelectedProducts();
  applyFilters();
});

/* ============================================================
   EVENT: Clear all selected products
   ============================================================ */
clearSelectedBtn.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelectedProducts();
  renderSelectedProducts();
  applyFilters();
  showToast("Selection cleared", "removed");
});

/* ============================================================
   EVENT: Skin type pills
   ============================================================ */
skinTypePills.addEventListener("click", (e) => {
  const pill = e.target.closest(".skin-pill");
  if (!pill) return;

  /* Toggle: clicking the active type deselects it */
  if (pill.classList.contains("active")) {
    pill.classList.remove("active");
    selectedSkinType = null;
    return;
  }

  skinTypePills
    .querySelectorAll(".skin-pill")
    .forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  selectedSkinType = pill.dataset.type;
});

/* ============================================================
   EVENT: Generate Routine button
   ============================================================ */
generateRoutineBtn.addEventListener("click", async () => {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    appendMessage("assistant", "Please select at least one product first, then I'll build your routine.");
    chatWindow.scrollIntoView({ behavior: "smooth", block: "end" });
    return;
  }

  generateRoutineBtn.disabled = true;
  generateRoutineBtn.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i> Building your routine…
  `;

  /* Include skin type in the prompt if the user picked one */
  const skinTypeNote = selectedSkinType
    ? `\nThe user has **${selectedSkinType}** skin — tailor the advice accordingly.`
    : "";

  const prompt = `
Create a personalized beauty routine using ONLY these selected products:

${JSON.stringify(selectedProducts, null, 2)}
${skinTypeNote}

Requirements:
- Organize by time of day (Morning / Evening) or by step, whichever fits best.
- For each step, name the product and give a brief tip on how to use it.
- Do not add or recommend products that are not in the list above.
- Use clear formatting with ## section headers and - bullet points.
  `.trim();

  showTyping();

  try {
    conversationHistory = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ];

    const reply = await getAIResponse(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
    routineGenerated = true;
    lastRoutineText = reply;

    hideTyping();
    appendMessage("assistant", reply);

    /* Show the Copy button now that a routine exists */
    copyRoutineBtn.style.display = "flex";

    chatWindow.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    hideTyping();
    appendMessage(
      "assistant",
      "Sorry, I couldn't generate the routine right now. Please check your Worker URL and API setup."
    );
    console.error(error);
  } finally {
    generateRoutineBtn.disabled = false;
    generateRoutineBtn.innerHTML = `
      <i class="fa-solid fa-wand-magic-sparkles"></i> Generate My Routine
    `;
  }
});

/* ============================================================
   EVENT: Copy routine to clipboard
   ============================================================ */
copyRoutineBtn.addEventListener("click", async () => {
  if (!lastRoutineText) return;

  try {
    await navigator.clipboard.writeText(lastRoutineText);
    copyRoutineBtn.classList.add("copied");
    copyRoutineBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
    showToast("Routine copied to clipboard", "success");

    setTimeout(() => {
      copyRoutineBtn.classList.remove("copied");
      copyRoutineBtn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
    }, 2500);
  } catch (error) {
    showToast("Could not copy — please copy manually", "error");
  }
});

/* ============================================================
   EVENT: Chat form — follow-up questions
   ============================================================ */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question) return;

  appendMessage("user", question);
  userInput.value = "";

  if (!routineGenerated) {
    appendMessage(
      "assistant",
      "Please generate a routine first using the button above, then ask me follow-up questions about it!"
    );
    return;
  }

  sendBtn.disabled = true;
  showTyping();

  try {
    conversationHistory.push({ role: "user", content: question });
    const reply = await getAIResponse(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
    hideTyping();
    appendMessage("assistant", reply);
  } catch (error) {
    hideTyping();
    appendMessage("assistant", "Sorry, I couldn't answer that right now. Please try again.");
    console.error(error);
  } finally {
    sendBtn.disabled = false;
  }
});

/* ============================================================
   INIT — runs once when the page loads
   ============================================================ */
async function init() {
  try {
    /* Load all products and restore saved selections */
    allProducts = await loadProducts();
    renderSelectedProducts();

    /* Greet the user */
    appendMessage(
      "assistant",
      "Hi! Browse the catalog, select the products you own or want to try, then hit **Generate My Routine** — I'll build a personalized routine just for you. You can also ask me follow-up questions after."
    );
  } catch (error) {
    console.error("Failed to initialize app:", error);
    productsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>Could not load products. Please refresh the page.</p>
      </div>
    `;
    appendMessage(
      "assistant",
      "Sorry, I couldn't load the product catalog. Please refresh the page and try again."
    );
  }
}

init();
