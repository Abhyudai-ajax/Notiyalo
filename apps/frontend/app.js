const { useState } = React;
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://notiyalo.onrender.com';


function Sidebar() {

    return (

        <div className="
            w-64
            bg-slate-900
            p-6
            flex
            flex-col
            gap-4
            border-r
            border-slate-800
        ">

            <h1 className="
                text-3xl
                font-bold
                text-blue-500
                mb-8
            ">
                Notiyalo
            </h1>

            <button className="
                bg-slate-800
                hover:bg-slate-700
                p-4
                rounded-xl
                text-left
                transition
            ">
                Dashboard
            </button>

            <button className="
                bg-slate-800
                hover:bg-slate-700
                p-4
                rounded-xl
                text-left
                transition
            ">
                Notes
            </button>

            <button className="
                bg-slate-800
                hover:bg-slate-700
                p-4
                rounded-xl
                text-left
                transition
            ">
                AI Assistant
            </button>

            <button className="
                bg-slate-800
                hover:bg-slate-700
                p-4
                rounded-xl
                text-left
                transition
            ">
                Analytics
            </button>

        </div>
    );
}

function NoteEditor({ currentNote, setCurrentNote }) {

    const [notes, setNotes] = useState([]);

    async function saveNote() {

        try {

            const response = await fetch(
                `${API_BASE_URL}/api/notes/create/`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify({
                        title: 'My Note',
                        content: currentNote,
                        tags: 'work,ai'
                    })
                }
            );

            const data = await response.json();

            console.log(data);

            setNotes([
                ...notes,
                {
                    title: "My Note",
                    content: currentNote
                }
            ]);

            alert("Note Saved!");

        } catch (error) {

            console.log(error);

            alert("Error saving note");
        }
    }

    return (

        <div className="
            bg-slate-900
            rounded-3xl
            p-6
            shadow-2xl
            border
            border-slate-800
        ">

            <h2 className="
                text-2xl
                font-bold
                mb-6
            ">
                Smart Note Editor
            </h2>

            <textarea
                value={currentNote}

                onChange={(e) =>
                    setCurrentNote(e.target.value)
                }

                placeholder="Write your thoughts..."

                className="
                    w-full
                    h-96
                    bg-slate-800
                    rounded-2xl
                    p-5
                    outline-none
                    resize-none
                    text-lg
                "
            />

            <button
                onClick={saveNote}

                className="
                    mt-6
                    bg-blue-600
                    hover:bg-blue-500
                    transition
                    px-6
                    py-4
                    rounded-2xl
                    w-full
                    font-semibold
                "
            >
                Save Note
            </button>

            <div className="mt-10">

                <h3 className="
                    text-2xl
                    font-bold
                    mb-4
                ">
                    Saved Notes
                </h3>

                <div className="space-y-4">

                    {notes.map((note, index) => (

                        <div
                            key={index}

                            className="
                                bg-slate-800
                                p-4
                                rounded-2xl
                            "
                        >

                            <h4 className="
                                text-xl
                                font-bold
                                mb-2
                            ">
                                {note.title}
                            </h4>

                            <p className="text-slate-300">
                                {note.content}
                            </p>

                        </div>

                    ))}

                </div>

            </div>

        </div>
    );
}

function AIPanel({ currentNote }) {

    const [summary, setSummary] = useState(
        "AI-generated summaries will appear here..."
    );

    async function generateSummary() {
        console.log(currentNote);

        try {

            const response = await fetch(
                `${API_BASE_URL}/api/ai/summary/`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify({
                        content: currentNote
                    })
                }
            );

            const data = await response.json();

            console.log(data);

            if (data.result) {

                setSummary(data.result);

            } else {

                setSummary(JSON.stringify(data));
            }

        } catch (error) {

            console.log(error);

            setSummary("AI Error");
        }
    }

    return (

        <div className="
            bg-slate-900
            rounded-3xl
            p-6
            border
            border-slate-800
        ">

            <h2 className="
                text-2xl
                font-bold
                mb-6
            ">
                AI Insights
            </h2>

            <div className="
                bg-slate-800
                rounded-2xl
                h-80
                p-5
                text-slate-300
                whitespace-pre-wrap
                overflow-y-auto
            ">

                <h3 className="
                    text-blue-400
                    font-bold
                    mb-4
                ">
                    AI Summary
                </h3>

                {summary}

            </div>

            <button
                onClick={generateSummary}

                className="
                    mt-6
                    bg-emerald-600
                    hover:bg-emerald-500
                    px-6
                    py-4
                    rounded-2xl
                    w-full
                    font-semibold
                    text-lg
                    transition
                "
            >
                Generate AI Summary
            </button>

        </div>
    );
}

function Header() {

    return (

        <div className="
            bg-slate-900
            border
            border-slate-800
            rounded-3xl
            p-6
            flex
            justify-between
            items-center
            mb-8
        ">

            <div>

                <h1 className="
                    text-3xl
                    font-bold
                ">
                    Welcome Back 👋
                </h1>

                <p className="
                    text-slate-400
                    mt-2
                ">
                    Your AI-powered workspace
                </p>

            </div>

            <div className="
                w-14
                h-14
                rounded-full
                bg-blue-600
                flex
                items-center
                justify-center
                text-xl
                font-bold
            ">
                N
            </div>

        </div>
    );
}

function App() {

    const [currentNote, setCurrentNote] = useState("");

    return (

        <div className="
            flex
            h-screen
            overflow-hidden
            bg-slate-950
            text-white
        ">

            <Sidebar />

            <div className="
                flex-1
                p-8
                overflow-y-auto
            ">

                <Header />

                <div className="
                    grid
                    grid-cols-3
                    gap-8
                ">

                    <div className="col-span-2">

                        <NoteEditor
                            currentNote={currentNote}
                            setCurrentNote={setCurrentNote}
                        />

                    </div>

                    <div>

                        <AIPanel
                            currentNote={currentNote}
                        />

                    </div>

                </div>

            </div>

        </div>
    );
}

ReactDOM.createRoot(
    document.getElementById("root")
).render(<App />);
