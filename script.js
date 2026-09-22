// --- APP STATE ---
let cart = [];
let orders = JSON.parse(localStorage.getItem("borJhauzOrders")) || [];
let activeTables = JSON.parse(localStorage.getItem("borJhauzActiveTables")) || {};
let dailySummary = JSON.parse(localStorage.getItem("borJhauzDailySummary")) || [];
let billNumber = parseInt(localStorage.getItem("borJhauzBill")) || 1001;

// --- INITIALIZE CATEGORY FILTER ---
function initCategories() {
    const categoryFilter = document.getElementById("categoryFilter");
    const categories = ["All", ...new Set(defaultMenu.map(item => item.category))];
    
    categoryFilter.innerHTML = categories
        .map(cat => `<option value="${cat}">${cat}</option>`)
        .join("");
}

// --- RENDER MENU ITEMS ---
function renderMenu(items) {
    const productList = document.getElementById("productList");
    if (!items || items.length === 0) {
        productList.innerHTML = '<div class="empty" style="grid-column:1/-1;">No matching items found</div>';
        return;
    }

    productList.innerHTML = items.map(item => `
        <div class="product">
            <div>
                <div class="product-header">
                    <h3>${item.name}</h3>
                    <span class="category-badge">${item.category}</span>
                </div>
                <p>₹${item.price}</p>
            </div>
            <button onclick="addItem('${escapeHtml(item.name)}', ${item.price})">Add +</button>
        </div>
    `).join("");
}

// Helper to escape single quotes in item names
function escapeHtml(str) {
    return str.replace(/'/g, "\\'");
}

// --- FILTER MENU ---
function filterMenu() {
    const query = document.getElementById("searchInput").value.toLowerCase().trim();
    const selectedCategory = document.getElementById("categoryFilter").value;

    const filtered = defaultMenu.filter(item => {
        const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
        const matchesSearch = item.name.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
    });

    renderMenu(filtered);
}

// --- CART MANAGEMENT ---
function addItem(name, price) {
    let existing = cart.find(item => item.name === name);

    if (existing) {
        existing.qty++;
    } else {
        cart.push({
            name: name,
            price: price,
            qty: 1
        });
    }

    renderCart();
}

function changeQty(index, amount) {
    if (!cart[index]) return;
    cart[index].qty += amount;

    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }

    renderCart();
}

function clearCart() {
    if (cart.length === 0) return;
    if (confirm("Clear current bill?")) {
        cart = [];
        renderCart();
    }
}

function renderCart() {
    const cartBox = document.getElementById("cart");
    const cartTotalElem = document.getElementById("cartTotal");

    if (cart.length === 0) {
        cartBox.innerHTML = '<div class="empty">No items added</div>';
        cartTotalElem.innerText = "0";
        return;
    }

    let html = "";
    let total = 0;

    cart.forEach((item, index) => {
        let subtotal = item.price * item.qty;
        total += subtotal;

        html += `
        <div class="cart-item">
            <div>
                <strong>${item.name}</strong>
                <br>
                <span style="color:#666; font-size:13px;">₹${item.price} × ${item.qty} = ₹${subtotal}</span>
            </div>
            <div class="qty">
                <button class="minus" onclick="changeQty(${index}, -1)">−</button>
                <span style="margin: 0 8px; font-weight: bold;">${item.qty}</span>
                <button class="plus" onclick="changeQty(${index}, 1)">+</button>
            </div>
        </div>
        `;
    });

    cartBox.innerHTML = html;
}

// --- ORDER PLACEMENT TO TABLE ---
function placeOrder() {
    if (cart.length === 0) {
        alert("Please add food items first.");
        return;
    }

    const tableInput = document.getElementById("tableNo");
    const rawVal = tableInput ? tableInput.value.trim() : "";
    const match = rawVal.match(/\d+/);
    const tableNum = match ? parseInt(match[0], 10) : null;

    if (!tableNum || tableNum < 1 || tableNum > 10) {
        alert("Please select or enter a Table (Table 1 to 10) to place this order.");
        if (tableInput) tableInput.focus();
        return;
    }

    let time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let currentBillNo;
    if (activeTables[tableNum] && activeTables[tableNum].bill) {
        currentBillNo = activeTables[tableNum].bill;
    } else {
        currentBillNo = billNumber;
        billNumber++;
        localStorage.setItem("borJhauzBill", billNumber);
    }

    if (!activeTables[tableNum]) {
        activeTables[tableNum] = {
            bill: currentBillNo,
            tableNo: `Table ${tableNum}`,
            time: time,
            items: []
        };
    } else {
        activeTables[tableNum].bill = currentBillNo;
    }

    // Merge or add items to this table
    cart.forEach(cartItem => {
        let existing = activeTables[tableNum].items.find(i => i.name === cartItem.name);
        if (existing) {
            existing.qty += cartItem.qty;
        } else {
            activeTables[tableNum].items.push({
                name: cartItem.name,
                qty: cartItem.qty,
                price: cartItem.price
            });
        }
    });

    // Calculate total
    activeTables[tableNum].total = activeTables[tableNum].items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    activeTables[tableNum].time = time;

    localStorage.setItem("borJhauzActiveTables", JSON.stringify(activeTables));

    // Immediately add or update in Today's Orders History
    let existingHistoryOrder = orders.find(o => (currentBillNo && o.bill == currentBillNo) || (o.tableNo === `Table ${tableNum}` && o.payment === "Pending"));
    if (existingHistoryOrder) {
        existingHistoryOrder.items = JSON.parse(JSON.stringify(activeTables[tableNum].items));
        existingHistoryOrder.amount = activeTables[tableNum].total;
        existingHistoryOrder.time = time;
    } else {
        orders.push({
            bill: currentBillNo,
            time: time,
            paidTime: null,
            tableNo: `Table ${tableNum}`,
            items: JSON.parse(JSON.stringify(activeTables[tableNum].items)),
            amount: activeTables[tableNum].total,
            payment: "Pending"
        });
    }
    localStorage.setItem("borJhauzOrders", JSON.stringify(orders));

    // Clear current bill cart
    cart = [];
    if (tableInput) tableInput.value = "";
    document.querySelectorAll(".table-card").forEach(c => c.classList.remove("active-table"));
    
    renderCart();
    renderTableCards();
    renderOrders();
    updateDashboard();

    // Scroll to the updated table card
    setTimeout(() => {
        const targetCard = document.getElementById(`tableCard-${tableNum}`);
        if (targetCard) {
            targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, 100);
}

// --- PRINT BILL ---
function printBill(order) {
    let itemsRows = "";

    order.items.forEach(item => {
        itemsRows += `
        <tr>
            <td>${item.name}</td>
            <td style="text-align:center;">${item.qty}</td>
            <td style="text-align:right;">₹${item.price}</td>
            <td style="text-align:right;">₹${item.price * item.qty}</td>
        </tr>
        `;
    });

    let billWindow = window.open("", "_blank", "width=600,height=700");

    billWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Bill #${order.bill} - Bor Jhauz Restaurant</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 25px;
                max-width: 480px;
                margin: auto;
                color: #222;
            }
            h1 {
                text-align: center;
                margin-bottom: 4px;
                font-size: 22px;
            }
            p.info {
                text-align: center;
                margin: 4px 0 15px;
                color: #555;
                font-size: 13px;
                line-height: 1.4;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
            }
            th, td {
                border-bottom: 1px solid #ddd;
                padding: 8px 4px;
                font-size: 13px;
            }
            th {
                text-align: left;
                background: #fef3e2;
                color: #78350f;
            }
            .summary {
                margin-top: 15px;
                border-top: 2px solid #ea580c;
                padding-top: 10px;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 6px;
                font-size: 14px;
            }
            .total-row {
                font-size: 18px;
                font-weight: bold;
            }
            .footer-msg {
                text-align: center;
                margin-top: 30px;
                font-size: 14px;
                color: #555;
            }
        </style>
    </head>
    <body>
        <div style="text-align: center; margin-bottom: 12px;">
            <img src="bhojlogo.jpeg" alt="Logo" style="height: 52px; width: 52px; border-radius: 50%; object-fit: cover; display: inline-block; margin-bottom: 5px;">
            <h1 style="margin: 0; font-size: 20px;"><img src="hari.png" alt="Icon" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;">Bor Jhauz Restaurant</h1>
        </div>
        <p class="info">
            Bill No: <strong>#${order.bill}</strong> | Table: <strong>${order.tableNo || 'N/A'}</strong><br>
            Time: ${order.time} | Payment: <strong>${order.payment || 'Cash'}</strong>
        </p>

        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th style="text-align:center;">Qty</th>
                    <th style="text-align:right;">Price</th>
                    <th style="text-align:right;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>

        <div class="summary">
            <div class="summary-row total-row">
                <span>Grand Total:</span>
                <span>₹${order.amount}</span>
            </div>
            <div class="summary-row">
                <span>Payment Mode:</span>
                <span>${order.payment || 'Cash'}</span>
            </div>
        </div>

        <div class="footer-msg">
            Thank You! Visit Again <img src="hari.png" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 2px;">
        </div>

        <script>
            window.onload = function() {
                window.print();
            };
        </script>
    </body>
    </html>
    `);

    billWindow.document.close();
}

// --- ORDER HISTORY ---
function renderOrders() {
    const table = document.getElementById("orderHistory");
    table.innerHTML = "";

    if (orders.length === 0) {
        table.innerHTML = `
        <tr>
            <td colspan="8" class="empty">No orders placed today</td>
        </tr>
        `;
        return;
    }

    orders.slice().reverse().forEach(order => {
        let itemText = order.items.map(i => `${i.name} × ${i.qty}`).join(", ");
        let tableDisplay = order.tableNo && order.tableNo !== "N/A" ? order.tableNo : "—";
        let payTimeDisplay = order.paidTime ? `<span style="font-weight:600; color:#111827;">${order.paidTime}</span>` : `<span style="color:#9ca3af;">—</span>`;

        let paymentBadge = "";
        if (order.payment === "Cash") {
            paymentBadge = `<span style="padding: 3px 8px; border-radius: 4px; background: #dcfce7; color: #15803d; font-weight: 600; font-size: 12px;">Cash</span>`;
        } else if (order.payment === "Online") {
            paymentBadge = `<span style="padding: 3px 8px; border-radius: 4px; background: #dbeafe; color: #1d4ed8; font-weight: 600; font-size: 12px;">Online</span>`;
        } else {
            paymentBadge = `<span style="padding: 3px 8px; border-radius: 4px; background: #fef3c7; color: #b45309; font-weight: 600; font-size: 12px;">Pending</span>`;
        }

        table.innerHTML += `
        <tr>
            <td><strong>#${order.bill}</strong></td>
            <td>${order.time}</td>
            <td><span class="table-badge">${tableDisplay}</span></td>
            <td>${itemText}</td>
            <td><strong>₹${order.amount}</strong></td>
            <td>${paymentBadge}</td>
            <td>${payTimeDisplay}</td>
            <td>
                <button class="print-btn" onclick='printBill(${JSON.stringify(order)})'>
                    <img src="hari.png" class="hari-icon-btn" alt="icon"> Print
                </button>
            </td>
        </tr>
        `;
    });
}

function clearHistory() {
    if (orders.length === 0) {
        alert("No orders in today's history to clear.");
        return;
    }

    let cashTotal = 0;
    let onlineTotal = 0;
    orders.forEach(order => {
        if (order.payment === "Cash") {
            cashTotal += order.amount;
        } else if (order.payment === "Online") {
            onlineTotal += order.amount;
        }
    });
    let grandTotal = cashTotal + onlineTotal;

    let confirmMsg = `Are you sure you want to clear today's order history?\n\nClosing Summary to be saved:\nCash: ₹${cashTotal}\nOnline: ₹${onlineTotal}\nTotal Collection: ₹${grandTotal}`;

    if (confirm(confirmMsg)) {
        let now = new Date();
        let dateStr = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
        let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let summaryRecord = {
            id: Date.now(),
            date: dateStr,
            time: timeStr,
            cash: cashTotal,
            online: onlineTotal,
            grandTotal: grandTotal,
            orderCount: orders.length
        };

        dailySummary.push(summaryRecord);
        localStorage.setItem("borJhauzDailySummary", JSON.stringify(dailySummary));

        orders = [];
        localStorage.removeItem("borJhauzOrders");

        activeTables = {};
        localStorage.removeItem("borJhauzActiveTables");

        renderOrders();
        updateDashboard();
        renderTableCards();
        renderDailySummary();
    }
}

// --- TABLE MANAGEMENT & BILLING ---
function selectTable(tableName) {
    const tableInput = document.getElementById("tableNo");
    if (tableInput) {
        tableInput.value = tableName;
        tableInput.focus();
    }

    document.querySelectorAll(".table-card").forEach(card => card.classList.remove("active-table"));
    const match = tableName.match(/\d+/);
    if (match) {
        const selectedCard = document.getElementById(`tableCard-${match[0]}`);
        if (selectedCard) {
            selectedCard.classList.add("active-table");
        }
    }

    // Smooth scroll to bill section on smaller screens
    const billSec = document.querySelector(".bill-section");
    if (billSec && window.innerWidth <= 800) {
        billSec.scrollIntoView({ behavior: "smooth" });
    }
}

function renderTableCards() {
    const grid = document.getElementById("tablesGrid");
    if (!grid) return;

    let html = "";
    for (let i = 1; i <= 10; i++) {
        const tableOrder = activeTables[i];
        const hasOrder = tableOrder && tableOrder.items && tableOrder.items.length > 0;

        if (hasOrder) {
            const itemsHtml = tableOrder.items.map(item => `
                <div class="table-item-row">
                    <span class="item-name">${escapeHtml(item.name)} <span class="item-qty-tag">×${item.qty}</span></span>
                    <span class="item-price">₹${item.price * item.qty}</span>
                </div>
            `).join("");

            html += `
            <div class="table-card active-order-card" id="tableCard-${i}">
                <div class="table-card-top">
                    <div class="table-title">
                        <h3>Table ${i}</h3>
                    </div>
                    <span class="table-time-badge">${tableOrder.time}</span>
                </div>
                
                <div class="table-status-wrap">
                    <span class="table-card-status occupied">Active Order</span>
                </div>

                <div class="table-order-details">
                    <div class="table-items-list">
                        ${itemsHtml}
                    </div>
                    <div class="table-total-row">
                        <span>Total:</span>
                        <strong class="total-amount">₹${tableOrder.total}</strong>
                    </div>
                </div>

                <div class="table-pay-btns">
                    <button class="table-pay-btn table-cash-btn" onclick="settleTableOrder(${i}, 'Cash')">
                        Cash
                    </button>
                    <button class="table-pay-btn table-online-btn" onclick="settleTableOrder(${i}, 'Online')">
                        Online
                    </button>
                </div>

                <button class="table-select-btn active-select-btn" type="button" onclick="selectTable('Table ${i}')">
                    Select Table (Add Items)
                </button>

                <button class="table-cancel-btn" onclick="cancelTableOrder(${i})">
                    Cancel Order
                </button>
            </div>
            `;
        } else {
            html += `
            <div class="table-card available-table" id="tableCard-${i}" onclick="selectTable('Table ${i}')">
                <div class="table-card-top">
                    <div class="table-title">
                        <h3>Table ${i}</h3>
                    </div>
                </div>
                <div class="table-status-wrap">
                    <span class="table-card-status available">Available</span>
                </div>
                <p class="table-empty-hint">No active order</p>
                <button class="table-select-btn" type="button" onclick="event.stopPropagation(); selectTable('Table ${i}')">
                    Select Table
                </button>
            </div>
            `;
        }
    }

    grid.innerHTML = html;
}

function settleTableOrder(tableNum, payment) {
    const tableOrder = activeTables[tableNum];
    if (!tableOrder || !tableOrder.items || tableOrder.items.length === 0) {
        alert("No active order for Table " + tableNum);
        return;
    }

    let payTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let order = orders.find(o => (tableOrder.bill && o.bill == tableOrder.bill) || (o.tableNo === `Table ${tableNum}` && o.payment === "Pending"));
    if (order) {
        order.payment = payment;
        order.amount = tableOrder.total;
        order.items = JSON.parse(JSON.stringify(tableOrder.items));
        order.paidTime = payTime;
    } else {
        order = {
            bill: tableOrder.bill || billNumber++,
            time: tableOrder.time || payTime,
            paidTime: payTime,
            tableNo: `Table ${tableNum}`,
            items: JSON.parse(JSON.stringify(tableOrder.items)),
            amount: tableOrder.total,
            payment: payment
        };
        orders.push(order);
    }

    localStorage.setItem("borJhauzOrders", JSON.stringify(orders));

    // Print bill receipt
    printBill(order);

    // Clear active order for this table
    delete activeTables[tableNum];
    localStorage.setItem("borJhauzActiveTables", JSON.stringify(activeTables));

    // Update UI
    renderTableCards();
    renderOrders();
    updateDashboard();
}

function cancelTableOrder(tableNum) {
    if (confirm(`Are you sure you want to cancel the active order for Table ${tableNum}?`)) {
        const billNoToCancel = activeTables[tableNum]?.bill;
        if (billNoToCancel) {
            orders = orders.filter(o => !(o.bill === billNoToCancel && o.payment === "Pending"));
            localStorage.setItem("borJhauzOrders", JSON.stringify(orders));
        }
        delete activeTables[tableNum];
        localStorage.setItem("borJhauzActiveTables", JSON.stringify(activeTables));
        renderTableCards();
        renderOrders();
        updateDashboard();
    }
}

// --- DASHBOARD METRICS ---
function updateDashboard() {
    let cash = 0;
    let online = 0;

    orders.forEach(order => {
        if (order.payment === "Cash") {
            cash += order.amount;
        } else if (order.payment === "Online") {
            online += order.amount;
        }
    });

    document.getElementById("cashTotal").innerText = "₹" + cash;
    document.getElementById("onlineTotal").innerText = "₹" + online;
    document.getElementById("grandTotal").innerText = "₹" + (cash + online);
}

// --- DAILY CLOSING SUMMARY HISTORY ---
function renderDailySummary() {
    const table = document.getElementById("dailySummaryHistory");
    if (!table) return;

    table.innerHTML = "";

    if (dailySummary.length === 0) {
        table.innerHTML = `
        <tr>
            <td colspan="6" class="empty">No closing summaries saved yet</td>
        </tr>
        `;
        return;
    }

    dailySummary.slice().reverse().forEach((item, index) => {
        let serialNo = dailySummary.length - index;
        table.innerHTML += `
        <tr>
            <td><strong>#${serialNo}</strong></td>
            <td><strong>${item.date}</strong></td>
            <td>${item.time}</td>
            <td><strong style="color: #16a34a;">₹${item.cash}</strong></td>
            <td><strong style="color: #2563eb;">₹${item.online}</strong></td>
            <td><strong style="color: #7c3aed; font-size: 15px;">₹${item.grandTotal}</strong></td>
        </tr>
        `;
    });
}

// --- INITIAL LOAD ---
initCategories();
renderMenu(defaultMenu);
renderCart();
renderOrders();
updateDashboard();
renderTableCards();
renderDailySummary();

