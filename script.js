/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const clearSelectedBtn = document.getElementById("clearSelected");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Added app state */
const STORAGE_KEY = "lorealSelectedProducts";
const WORKER_URL =
  window.CLOUDFLARE_WORKER_URL ||
  window.WORKER_URL ||
  "https://api-worker.rk4b2rt5k6.workers.dev/";

const SYSTEM_PROMPT = `
You are a L'Oréal Smart Routine & Product Advisor.

Rules:
- Stay focused only on beauty topics such as skincare, haircare, makeup, fragrance, grooming, and the user's selected routine.
- When generating a routine, use ONLY the selected products provided.
- Do not invent products that were not selected.
- For follow-up questions, remember the earlier conversation and routine.
- If the user asks something unrelated, briefly redirect them back to product or routine questions.
- Keep answers clear, friendly, and organized.
`.trim();

let allProducts = [];
let selectedProductIds = new Set(loadSavedSelections());
let conversationHistory = [];
let routineGenerated = false;

/* Added helper for localStorage */
function loadSavedSelections() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

/* Added helper for localStorage */
function saveSelectedProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedProductIds]));
}

/* Added helper to safely show text */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Added helper to show chat messages */
function appendMessage(role, text) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Added helper to get the full selected product objects */
function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

/* Added helper to render selected products */
function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();

  clearSelectedBtn.disabled = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <div class="placeholder-message selected-placeholder">
        No products selected yet
      </div>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-item">
          <span>${product.brand} - ${product.name}</span>
          <button class="remove-selected" data-id="${product.id}" type="button">
            ×
          </button>
        </div>
      `
    )
    .join("");
}

/* Added helper to read different Worker response formats */
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

  return "I received a response, but could not read it correctly.";
}

/* Added helper to call your Cloudflare Worker */
async function getAIResponse(messages) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages })
  });

  if (!response.ok) {
    throw new Error("Worker request failed");
  }

  const data = await response.json();
  return extractReply(data);
}

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found in this category
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);

      return `
        <div class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}">
          <div class="selected-badge">${isSelected ? "Selected" : "Select"}</div>
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
            <details class="product-description">
              <summary>View Description</summary>
              <p>${product.description}</p>
            </details>
          </div>
        </div>
      `;
    })
    .join("");
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  if (allProducts.length === 0) {
    allProducts = await loadProducts();
  }

  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Added click handling so cards can be selected/unselected */
productsContainer.addEventListener("click", (e) => {
  if (e.target.closest("summary") || e.target.closest("details")) {
    return;
  }

  const card = e.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.id);

  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelectedProducts();
  renderSelectedProducts();

  if (categoryFilter.value) {
    const filteredProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value
    );
    displayProducts(filteredProducts);
  }
});

/* Added remove button support in selected products list */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-selected");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.id);
  selectedProductIds.delete(productId);
  saveSelectedProducts();
  renderSelectedProducts();

  if (categoryFilter.value) {
    const filteredProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value
    );
    displayProducts(filteredProducts);
  }
});

/* Added clear all support */
clearSelectedBtn.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelectedProducts();
  renderSelectedProducts();

  if (categoryFilter.value) {
    const filteredProducts = allProducts.filter(
      (product) => product.category === categoryFilter.value
    );
    displayProducts(filteredProducts);
  }
});

/* Added routine generation button handler */
generateRoutineBtn.addEventListener("click", async () => {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    appendMessage("assistant", "Please select at least one product first.");
    return;
  }

  generateRoutineBtn.disabled = true;
  generateRoutineBtn.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i> Generating...
  `;

  try {
    appendMessage("assistant", "Building your personalized routine...");

    const prompt = `
Create a personalized routine using ONLY these selected products:

${JSON.stringify(selectedProducts, null, 2)}

Requirements:
- Organize the routine clearly
- Explain how to use each selected product
- Do not add products that were not selected
- Keep the explanation friendly and practical
    `.trim();

    conversationHistory = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ];

    const reply = await getAIResponse(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
    routineGenerated = true;

    appendMessage("assistant", reply);
  } catch (error) {
    appendMessage(
      "assistant",
      "Sorry, I could not generate the routine right now. Check your Worker URL and API setup."
    );
    console.error(error);
  } finally {
    generateRoutineBtn.disabled = false;
    generateRoutineBtn.innerHTML = `
      <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine
    `;
  }
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question) return;

  appendMessage("user", question);
  userInput.value = "";

  if (!routineGenerated) {
    appendMessage(
      "assistant",
      "Generate a routine first, then ask follow-up questions about it."
    );
    return;
  }

  sendBtn.disabled = true;

  try {
    conversationHistory.push({ role: "user", content: question });
    const reply = await getAIResponse(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
    appendMessage("assistant", reply);
  } catch (error) {
    appendMessage(
      "assistant",
      "Sorry, I could not answer that right now. Please try again."
    );
    console.error(error);
  } finally {
    sendBtn.disabled = false;
  }
});

/* Added initial load so saved products appear after refresh */
async function init() {
  allProducts = await loadProducts();
  renderSelectedProducts();
  appendMessage(
    "assistant",
    "Hi! Select products, generate a routine, and then ask follow-up questions."
  );
}

init();