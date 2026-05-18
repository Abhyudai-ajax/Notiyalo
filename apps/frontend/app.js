const { useState, useEffect } = React;

// ✅ FIX 1: Single correct backend URL
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://notiyalo.onrender.com';


// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ activeSection, setActiveSection }) {

    const navItems = [
        { id: "dashboard", label: "Dashboard" },
        { id: "notes", label: "Notes" },
        { id: "ai", label: "AI Assistant" },
    ];

    return (
        <div className="w-64 bg-slate-900 p-6 flex flex-col gap-4 border-r border-slate-800">

            <h1 className="text-3xl font-bold text-blue-500 mb-8">Notiyalo</h1>

            {navItems.map(item => (
                <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`p-4 rounded-xl text-left transition font-semibold ${activeSection === item.id
                        ? "bg-blue-600"
                        : "bg-slate-800 hover:bg-slate-700"
                        }`}
                >
                    {item.label}
                </button>
            ))}

        </div>
    );
}


// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ setIsLoggedIn }) {

    function logout() {
        localStorage.removeItem("token");
        setIsLoggedIn(false);
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex justify-between items-center mb-8">
            <div>
                <h1 className="text-3xl font-bold">Welcome Back 👋</h1>
                <p className="text-slate-400 mt-2">Your AI-powered workspace</p>
            </div>
            <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 transition px-5 py-3 rounded-2xl font-semibold text-sm"
            >
                Logout
            </button>
        </div>
    );
}


// ─── Note Editor ──────────────────────────────────────────────────────────────

function NoteEditor({ currentNote, setCurrentNote }) {

    const [notes, setNotes] = useState([]);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);

    // ✅ FIX: Load saved notes from backend on mount
    useEffect(() => { fetchNotes(); }, []);

    async function fetchNotes() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/notes/`, {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            });
            const data = await response.json();
            setNotes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        }
    }

    async function saveNote() {

        if (!currentNote.trim()) {
            alert("Please write something before saving.");
            return;
        }

        try {
            setSaving(true);

            const response = await fetch(`${API_BASE_URL}/api/notes/create/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // ✅ FIX: Send auth token
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    title: title.trim() || 'My Note',
                    content: currentNote,
                    tags: 'work,ai'
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            alert("Note Saved!");
            setTitle("");
            setCurrentNote("");
            fetchNotes(); // ✅ FIX: Refresh list after save

        } catch (error) {
            console.error(error);
            alert("Error saving note: " + error.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800">

            <h2 className="text-2xl font-bold mb-6">Smart Note Editor</h2>

            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
                className="w-full bg-slate-800 rounded-2xl p-4 outline-none text-white mb-4"
            />

            <textarea
                value={currentNote}
                onChange={(e) => setCurrentNote(e.target.value)}
                placeholder="Write your thoughts..."
                className="w-full h-80 bg-slate-800 rounded-2xl p-5 outline-none resize-none text-lg text-white"
            />

            <button
                onClick={saveNote}
                disabled={saving}
                className="mt-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition px-6 py-4 rounded-2xl w-full font-semibold"
            >
                {saving ? "Saving..." : "Save Note"}
            </button>

            {/* Saved notes list */}
            <div className="mt-10">
                <h3 className="text-2xl font-bold mb-4">Saved Notes</h3>

                {notes.length === 0 && (
                    <p className="text-slate-500">No notes yet. Save one above!</p>
                )}

                <div className="space-y-4">
                    {notes.map((note) => (
                        <div key={note.id || note.title} className="bg-slate-800 p-4 rounded-2xl">
                            <h4 className="text-xl font-bold mb-2">{note.title}</h4>
                            <p className="text-slate-300 text-sm leading-6">
                                {note.content?.slice(0, 200)}{note.content?.length > 200 ? "..." : ""}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}


// ─── AI Panel ─────────────────────────────────────────────────────────────────

function AIPanel({ currentNote }) {

    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function generateSummary() {

        if (!currentNote || !currentNote.trim()) {
            alert("Write something in the note first.");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`${API_BASE_URL}/api/ai/summary/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // ✅ FIX: Send auth token
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ content: currentNote })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            // ✅ FIX: Backend returns { summary, insights, title } — not data.result
            setSummary(data);

        } catch (error) {
            console.error(error);
            setError(error.message || "Failed to generate summary");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">

            <h2 className="text-2xl font-bold mb-6">AI Insights</h2>

            <div className="bg-slate-800 rounded-2xl min-h-80 p-5 text-slate-300 overflow-y-auto">

                <h3 className="text-blue-400 font-bold mb-4">AI Summary</h3>

                {/* States */}
                {!loading && !error && !summary && (
                    <p className="text-slate-500">Click "Generate AI Summary" to analyse your note.</p>
                )}

                {loading && (
                    <p className="text-slate-400 animate-pulse">Generating summary...</p>
                )}

                {error && (
                    <p className="text-red-400">{error}</p>
                )}

                {/* ✅ FIX: Render structured summary fields */}
                {!loading && !error && summary && (
                    <div>
                        <h4 className="text-cyan-400 font-bold mb-2">Summary</h4>
                        <p className="leading-7 mb-6">{summary.summary}</p>

                        {summary.insights?.length > 0 && (
                            <>
                                <h4 className="text-emerald-400 font-bold mb-2">Key Insights</h4>
                                <ul className="list-disc pl-6 space-y-2 mb-6">
                                    {summary.insights.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {summary.title && (
                            <>
                                <h4 className="text-pink-400 font-bold mb-2">Suggested Title</h4>
                                <p className="text-xl font-semibold text-white">{summary.title}</p>
                            </>
                        )}
                    </div>
                )}

            </div>

            <button
                onClick={generateSummary}
                disabled={loading}
                className="mt-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-6 py-4 rounded-2xl w-full font-semibold text-lg transition"
            >
                {loading ? "Generating..." : "Generate AI Summary"}
            </button>

        </div>
    );
}


// ─── App Root ─────────────────────────────────────────────────────────────────

function App() {

    const [currentNote, setCurrentNote] = useState("");
    const [activeSection, setActiveSection] = useState("dashboard");
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
                <p className="text-slate-400">Please log in via the main page.</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950 text-white">

            <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

            <div className="flex-1 p-8 overflow-y-auto">

                <Header setIsLoggedIn={setIsLoggedIn} />

                {activeSection === "dashboard" && (
                    <div className="grid grid-cols-3 gap-8">
                        <div className="col-span-2">
                            <NoteEditor
                                currentNote={currentNote}
                                setCurrentNote={setCurrentNote}
                            />
                        </div>
                        <div>
                            <AIPanel currentNote={currentNote} />
                        </div>
                    </div>
                )}

                {activeSection === "notes" && (
                    <div className="text-slate-400 mt-10">
                        <p>Switch to the full <strong className="text-white">index.html</strong> for the complete Notes Manager view.</p>
                    </div>
                )}

                {activeSection === "ai" && (
                    <div className="text-slate-400 mt-10">
                        <p>Switch to the full <strong className="text-white">index.html</strong> for the AI Assistant chat.</p>
                    </div>
                )}

            </div>

        </div>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
