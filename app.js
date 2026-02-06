const API_URL = "https://script.google.com/macros/s/AKfycby0YyZ22pASVXX_5IIdymwUwS5xZHIGFVyT3Ukby_Vp3EyWbVdWNNo0SLCeCfQ3TlP58g/exec"; // <--- PASTE API URL

// Global State
let habits = [];
let logs = [];
let selectedDate = new Date();
let currentCalendarMonth = new Date();

// --- 1. INITIALIZATION (INSTANT LOAD) ---

window.addEventListener('DOMContentLoaded', () => {
    // 1. Load from Local Memory IMMEDIATELY
    loadFromCache();
    
    // 2. Render UI immediately (Users sees data in 0.01s)
    document.getElementById('series-start-date').valueAsDate = new Date();
    renderCalendar();
    renderTasksForDate(selectedDate);
    
    // 3. Sync with Google in Background (User doesn't wait)
    syncData(); 
});

// Load data from browser storage
function loadFromCache() {
    const cachedHabits = localStorage.getItem('myHabits');
    const cachedLogs = localStorage.getItem('myLogs');
    if (cachedHabits) habits = JSON.parse(cachedHabits);
    if (cachedLogs) logs = JSON.parse(cachedLogs);
}

// Save data to browser storage
function saveToCache() {
    localStorage.setItem('myHabits', JSON.stringify(habits));
    localStorage.setItem('myLogs', JSON.stringify(logs));
}

// Fetch fresh data from Google
async function syncData() {
    try {
        const res = await fetch(API_URL, {
            method: 'POST', 
            body: JSON.stringify({ action: 'GET_DATA' })
        });
        const data = await res.json();
        
        // Update state and cache
        habits = data.habits;
        logs = data.logs;
        saveToCache();
        
        // Re-render to ensure accuracy
        renderCalendar();
        renderTasksForDate(selectedDate);
    } catch (e) { console.error("Sync failed", e); }
}


// --- 2. INSTANT SAVE ACTIONS (OPTIMISTIC UI) ---

// A. New Task
document.getElementById('save-btn').onclick = () => {
    const name = document.getElementById('habit-name').value;
    const dateInput = document.getElementById('habit-date').value; 
    
    if(!name) return alert("Enter name");

    // 1. Update LOCAL
    const newId = generateUUID();
    const newHabit = {
        id: newId,
        name: name,
        freq: dateInput ? 'Specific' : 'Daily',
        targetDate: dateInput || null
    };
    
    habits.push(newHabit);
    saveToCache(); // Save to memory
    closeModals();
    renderTasksForDate(selectedDate); // Show on screen NOW

    // 2. Send to Google (Background)
    fetch(API_URL, { 
        method: 'POST', 
        body: JSON.stringify({
            action: 'ADD_HABIT',
            id: newId,
            name: name,
            frequency: newHabit.freq,
            targetDate: newHabit.targetDate || ''
        })
    });
};

// B. Series Task
document.getElementById('save-series-btn').onclick = () => {
    const prefix = document.getElementById('series-name').value;
    const startStr = document.getElementById('series-start-date').value;
    const count = parseInt(document.getElementById('series-count').value);

    if(!prefix || !startStr) return alert("Fill all fields");

    closeModals(); // Close immediately

    // 1. Generate Local Items
    const items = [];
    const parts = startStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);

    let currentDate = new Date(year, month, day, 12, 0, 0); // Noon logic

    for(let i = 1; i <= count; i++) {
        const localId = generateUUID();
        const dateString = getLocalDateString(currentDate);
        
        const item = { id: localId, name: `${prefix} ${i}`, targetDate: dateString, freq: 'Specific' };
        
        // Add to local state
        habits.push(item);
        // Prepare for server
        items.push({ id: localId, name: item.name, targetDate: dateString });
        
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // 2. Render NOW
    saveToCache();
    renderCalendar();
    renderTasksForDate(selectedDate);

    // 3. Sync Background
    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'BATCH_ADD', items: items })
    });
};

// C. Toggle Check
window.toggleHabit = (id, dateStr, isDone) => {
    if(isDone) return;
    
    // Update Local
    logs.push({ habitId: id, date: dateStr });
    saveToCache();
    renderTasksForDate(selectedDate); // Instant checkmark

    // Send Background
    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'LOG_HABIT', habitId: id, date: dateStr })
    });
};


// --- 3. RENDERING & UTILS (Same as before) ---

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function renderTasksForDate(dateObj) {
    const dateStr = getLocalDateString(dateObj);
    const selectedDateTitle = document.getElementById('selected-date-title');
    const habitList = document.getElementById('habit-list');
    const taskCountLabel = document.getElementById('task-count');

    const todayStr = getLocalDateString(new Date());
    if (dateStr === todayStr) selectedDateTitle.innerText = "Today's Tasks";
    else selectedDateTitle.innerText = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    habitList.innerHTML = '';

    const dailyHabits = habits.filter(h => {
        if (h.targetDate) return h.targetDate === dateStr; 
        return h.freq === 'Daily'; 
    });

    taskCountLabel.innerText = `${dailyHabits.length} Tasks`;

    const completedCount = dailyHabits.filter(h => 
        logs.some(l => l.habitId === h.id && l.date.substring(0,10) === dateStr)
    ).length;

    const totalCount = dailyHabits.length;
    const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
    document.getElementById('total-completions').innerText = `${percent}%`;

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
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearLabel = document.getElementById('month-year');
    calendarGrid.innerHTML = '';
    
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    
    monthYearLabel.innerText = currentCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        calendarGrid.appendChild(document.createElement('div'));
    }

    const todayStr = getLocalDateString(new Date());
    const selectedStr = getLocalDateString(selectedDate);

    for (let i = 1; i <= lastDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell';
        div.innerText = i;
        
        const loopDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

        if (loopDateStr === todayStr) div.classList.add('today');
        if (loopDateStr === selectedStr) div.classList.add('active');

        if (habits.some(h => h.targetDate === loopDateStr)) {
            const dot = document.createElement('div');
            dot.className = 'day-dot';
            div.appendChild(dot);
        }

        div.onclick = () => {
            selectedDate = new Date(year, month, i, 12, 0, 0); 
            renderCalendar(); 
            renderTasksForDate(selectedDate);
        };

        calendarGrid.appendChild(div);
    }
}

// Helpers
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

window.changeMonth = (dir) => {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + dir);
    renderCalendar();
};

window.openModal = () => document.getElementById('modal').classList.remove('hidden');
window.openSeriesModal = () => document.getElementById('series-modal').classList.remove('hidden');
window.closeModals = () => {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('series-modal').classList.add('hidden');
};
