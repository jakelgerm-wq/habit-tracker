const API_URL = "https://script.google.com/macros/s/AKfycbwqYwd1r5B47SvgQo4g2rsdhs09OmTz4PZXHAl-qbisUBD9LRxwJhy96OSYg-ypStTCxw/exec"; // <--- PASTE YOUR API URL
const USER_ID = "demo_user";

// State
let habits = [];
let logs = [];
let selectedDate = new Date(); // Defaults to today
let currentCalendarMonth = new Date(); // For navigating months

// DOM Elements
const habitList = document.getElementById('habit-list');
const selectedDateTitle = document.getElementById('selected-date-title');
const taskCountLabel = document.getElementById('task-count');
const calendarGrid = document.getElementById('calendar-grid');
const monthYearLabel = document.getElementById('month-year');

// Initialization
window.addEventListener('DOMContentLoaded', () => {
    // Set default date inputs to today
    document.getElementById('series-start-date').valueAsDate = new Date();
    fetchData();
});

// --- API & DATA ---

async function fetchData() {
    try {
        const res = await fetch(API_URL, {
            method: 'POST', body: JSON.stringify({ action: 'GET_DATA' })
        });
        const data = await res.json();
        habits = data.habits;
        logs = data.logs;
        
        renderCalendar();
        renderTasksForDate(selectedDate);
    } catch (e) { console.error(e); }
}

// --- RENDER LOGIC ---

function renderTasksForDate(dateObj) {
    const dateStr = dateObj.toISOString().split('T')[0];
    
    // 1. Update Title
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) selectedDateTitle.innerText = "Today's Tasks";
    else selectedDateTitle.innerText = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    habitList.innerHTML = '';

    // 2. Filter Habits for this Date
    const dailyHabits = habits.filter(h => {
        if (h.targetDate) return h.targetDate === dateStr; // Specific date match
        return h.freq === 'Daily'; // Daily recurrence
    });

    taskCountLabel.innerText = `${dailyHabits.length} Tasks`;

    // --- NEW CODE: CALCULATE PERCENTAGE ---
    const completedCount = dailyHabits.filter(h => 
        logs.some(l => l.habitId === h.id && l.date.substring(0,10) === dateStr)
    ).length;

    const totalCount = dailyHabits.length;
    const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
    
    // Update the HTML element
    document.getElementById('total-completions').innerText = `${percent}%`;
    // --------------------------------------

    if(dailyHabits.length === 0) {
        habitList.innerHTML = `<div style="text-align:center; color:#999; margin-top:40px;">No tasks for this day.</div>`;
        return;
    }

    dailyHabits.forEach(habit => {
        const isDone = logs.some(l => l.habitId === habit.id && l.date.substring(0,10) === dateStr);
        
        const div = document.createElement('div');
        div.className = 'habit-card';
        div.innerHTML = `
            <div>
                <h4>${habit.name}</h4>
                <div class="habit-meta">${habit.freq === 'Specific' ? '📅 Scheduled' : '🔁 Daily'}</div>
            </div>
            <button class="check-circle ${isDone ? 'completed' : ''}" 
                onclick="toggleHabit('${habit.id}', '${dateStr}', ${isDone})">
                <i class="fa-solid fa-check"></i>
            </button>
        `;
        habitList.appendChild(div);
    });
}

function renderCalendar() {
    calendarGrid.innerHTML = '';
    
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    
    monthYearLabel.innerText = currentCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Days in month
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Empty slots for previous month
    for (let i = 0; i < firstDayIndex; i++) {
        const div = document.createElement('div');
        calendarGrid.appendChild(div);
    }

    // Days
    const todayStr = new Date().toISOString().split('T')[0];
    const selectedStr = selectedDate.toISOString().split('T')[0];

    for (let i = 1; i <= lastDay; i++) {
        const dateStr = new Date(year, month, i).toISOString().split('T')[0]; // Adjust timezone in real app
        // Correct date string construction to avoid timezone off-by-one errors
        const currentLoopDate = new Date(year, month, i);
        const loopDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        
        const div = document.createElement('div');
        div.className = 'day-cell';
        div.innerText = i;

        // Highlight Today
        if (loopDateStr === todayStr) div.classList.add('today');
        
        // Highlight Selected
        if (loopDateStr === selectedStr) div.classList.add('active');

        // Check if any tasks exist for this day (Green Dot)
        const hasTasks = habits.some(h => h.targetDate === loopDateStr);
        if (hasTasks) {
            const dot = document.createElement('div');
            dot.className = 'day-dot';
            div.appendChild(dot);
        }

        div.onclick = () => {
            selectedDate = new Date(year, month, i);
            renderCalendar(); // Re-render to update 'active' class
            renderTasksForDate(selectedDate);
        };

        calendarGrid.appendChild(div);
    }
}

// --- ACTIONS ---

// 1. Toggle Check
window.toggleHabit = async (id, dateStr, isDone) => {
    if(isDone) return;
    
    logs.push({ habitId: id, date: dateStr });
    renderTasksForDate(selectedDate); // Optimistic update

    await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'LOG_HABIT', habitId: id, date: dateStr })
    });
};

// 2. Create Single Task
document.getElementById('save-btn').onclick = async () => {
    const name = document.getElementById('habit-name').value;
    const dateInput = document.getElementById('habit-date').value; // YYYY-MM-DD
    
    if(!name) return alert("Enter name");

    const payload = {
        action: 'ADD_HABIT',
        userId: USER_ID,
        name: name,
        frequency: dateInput ? 'Specific' : 'Daily',
        targetDate: dateInput || ''
    };

    closeModals();
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    fetchData(); // Refresh all
};

// 3. Create SERIES (Class 1...29)
document.getElementById('save-series-btn').onclick = async () => {
    const prefix = document.getElementById('series-name').value;
    const startStr = document.getElementById('series-start-date').value;
    const count = parseInt(document.getElementById('series-count').value);

    if(!prefix || !startStr) return alert("Fill all fields");

    const btn = document.getElementById('save-series-btn');
    btn.innerText = "Generating...";
    
    // Generate the array of habits
    const items = [];
    let currentDate = new Date(startStr);

    for(let i = 1; i <= count; i++) {
        items.push({
            name: `${prefix} ${i}`,
            targetDate: currentDate.toISOString().split('T')[0]
        });
        // Add 1 day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    try {
        await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'BATCH_ADD',
                userId: USER_ID,
                items: items
            })
        });
        alert(`Successfully created ${count} tasks!`);
        fetchData();
    } catch(e) {
        alert("Error creating series");
    }
    
    closeModals();
    btn.innerText = "Generate Series";
};

// --- HELPERS ---
function changeMonth(dir) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + dir);
    renderCalendar();
}

window.openModal = () => document.getElementById('modal').classList.remove('hidden');
window.openSeriesModal = () => document.getElementById('series-modal').classList.remove('hidden');
window.closeModals = () => {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('series-modal').classList.add('hidden');
};