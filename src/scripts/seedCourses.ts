import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDlGaMqMMtMH5cfQ28XVuF3fABKkws5-H4",
    authDomain: "ourstudyai-cd5ee.firebaseapp.com",
    projectId: "ourstudyai-cd5ee",
    storageBucket: "ourstudyai-cd5ee.firebasestorage.app",
    messagingSenderId: "325989009755",
    appId: "1:325989009755:web:145a1c36d501337057327e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const courses = [
    // ─── THEOLOGY — YEAR 1, SEMESTER 1 ───
    { code: 'THEO101', name: 'Sacred Scripture OT: Historical and Legal Books', department: 'theology', year: 1, semester: 1, description: 'Study of the Old Testament historical and legal books.' },
    { code: 'THEO111', name: 'Sacred Scripture NT: Synoptic Gospels and Acts of the Apostles', department: 'theology', year: 1, semester: 1, description: 'Study of the Synoptic Gospels and Acts.' },
    { code: 'THEO121', name: 'Introduction to Sacred Scripture', department: 'theology', year: 1, semester: 1, description: 'General introduction to Sacred Scripture.' },
    { code: 'THEO132', name: 'NT: Figure of Jesus in the New Testament', department: 'theology', year: 1, semester: 1, description: 'Study of the figure of Jesus in the NT.' },
    { code: 'THEO113', name: 'De Deo Uno Et Trino', department: 'theology', year: 1, semester: 1, description: 'Theology of the One and Triune God.' },
    { code: 'THEO104', name: 'Fundamental Moral Theology', department: 'theology', year: 1, semester: 1, description: 'Foundations of moral theology.' },
    { code: 'SPTH101', name: 'Spiritual Theology', department: 'theology', year: 1, semester: 1, description: 'Introduction to spiritual theology.' },
    { code: 'PAT101', name: 'Patrology', department: 'theology', year: 1, semester: 1, description: 'Study of the Church Fathers.' },
    { code: 'CCH101', name: 'Introduction to Church History', department: 'theology', year: 1, semester: 1, description: 'Overview of Church history.' },
    { code: 'CL101', name: 'Canon Law: History, General Norms and the People of God', department: 'theology', year: 1, semester: 1, description: 'Introduction to Canon Law.' },
    { code: 'BLG101', name: 'Greek Language (Elementary)', department: 'theology', year: 1, semester: 1, description: 'Elementary Biblical Greek.' },
    { code: 'BLH101', name: 'Biblical Hebrew', department: 'theology', year: 1, semester: 1, description: 'Introduction to Biblical Hebrew.' },
    { code: 'ENG101', name: 'Use of English', department: 'theology', year: 1, semester: 1, description: 'English language skills.' },
    { code: 'PSTH204', name: 'Pastoral Theology', department: 'theology', year: 1, semester: 1, description: 'Introduction to pastoral theology.' },

    // ─── THEOLOGY — YEAR 1, SEMESTER 2 ───
    { code: 'THEO111B', name: 'Sacred Scripture NT: Synoptic Gospels (Sem 2)', department: 'theology', year: 1, semester: 2, description: 'Continuation of Synoptic Gospels study.' },
    { code: 'THEO102', name: 'Sacred Scripture OT (Semester 2)', department: 'theology', year: 1, semester: 2, description: 'Continued OT study.' },
    { code: 'THEO131', name: 'NT Studies (Semester 2)', department: 'theology', year: 1, semester: 2, description: 'New Testament studies continuation.' },
    { code: 'SPTH101B', name: 'Spiritual Theology (Sem 2)', department: 'theology', year: 1, semester: 2, description: 'Continuation of spiritual theology.' },
    { code: 'PAT101B', name: 'Patrology (Sem 2)', department: 'theology', year: 1, semester: 2, description: 'Continuation of Patrology.' },
    { code: 'ENG101B', name: 'Use of English (Sem 2)', department: 'theology', year: 1, semester: 2, description: 'Continued English language skills.' },
    { code: 'BLH101B', name: 'Biblical Hebrew (Sem 2)', department: 'theology', year: 1, semester: 2, description: 'Continuation of Biblical Hebrew.' },
    { code: 'CL101B', name: 'Canon Law (Sem 2)', department: 'theology', year: 1, semester: 2, description: 'Continuation of Canon Law.' },

    // ─── THEOLOGY — YEAR 2, SEMESTER 1 ───
    { code: 'THEO201', name: 'Sacred Scripture OT: Prophetic Books', department: 'theology', year: 2, semester: 1, description: 'Study of OT prophetic books.' },
    { code: 'THEO203', name: 'Christology', department: 'theology', year: 2, semester: 1, description: 'Study of the person of Jesus Christ.' },
    { code: 'THEO211', name: 'Sacred Writing: Corpus Johanneum', department: 'theology', year: 2, semester: 1, description: 'Study of the Johannine corpus.' },
    { code: 'THEO204', name: 'Special Moral Theology: Human Life', department: 'theology', year: 2, semester: 1, description: 'Moral theology on human life.' },
    { code: 'CCH201', name: 'Church History II', department: 'theology', year: 2, semester: 1, description: 'Continuation of Church history.' },
    { code: 'PAT201', name: 'Patrology II', department: 'theology', year: 2, semester: 1, description: 'Advanced Patrology.' },
    { code: 'MIS201', name: 'Missiology', department: 'theology', year: 2, semester: 1, description: 'Study of Christian mission.' },
    { code: 'BLG201', name: 'Greek Language II', department: 'theology', year: 2, semester: 1, description: 'Intermediate Biblical Greek.' },
    { code: 'BLH201', name: 'Biblical Hebrew II', department: 'theology', year: 2, semester: 1, description: 'Intermediate Biblical Hebrew.' },

    // ─── PHILOSOPHY — YEAR 1, SEMESTER 1 ───
    { code: 'PHI101', name: 'Introduction to Philosophy', department: 'philosophy', year: 1, semester: 1, description: 'General introduction to philosophy.' },
    { code: 'PHI107', name: 'Plato – Symposium', department: 'philosophy', year: 1, semester: 1, description: 'Study of Plato\'s Symposium.' },
    { code: 'PHI106', name: 'Philosophy (Year 1 Course)', department: 'philosophy', year: 1, semester: 1, description: 'Year 1 philosophy course.' },
    { code: 'BLH101P', name: 'Latin', department: 'philosophy', year: 1, semester: 1, description: 'Introduction to Latin language.' },
    { code: 'BCG101', name: 'Introduction to New Testament Greek', department: 'philosophy', year: 1, semester: 1, description: 'Elementary NT Greek.' },
    { code: 'BLI101', name: 'Introduction to Igbo Grammar', department: 'philosophy', year: 1, semester: 1, description: 'Basic Igbo grammar.' },
    { code: 'BAF101', name: 'African Thought and Culture', department: 'philosophy', year: 1, semester: 1, description: 'Study of African thought and culture.' },
    { code: 'GES101', name: 'Use of English 1', department: 'philosophy', year: 1, semester: 1, description: 'English language skills.' },
    { code: 'GES106', name: 'Philosophy: Logic and Critical Thinking', department: 'philosophy', year: 1, semester: 1, description: 'Logic and critical thinking.' },
    { code: 'BSTH107', name: 'Spiritual Theology', department: 'philosophy', year: 1, semester: 1, description: 'Introduction to spiritual theology.' },
    { code: 'BRCS101', name: 'Religious Course (Year 1)', department: 'philosophy', year: 1, semester: 1, description: 'Year 1 religious studies course.' },

    // ─── PHILOSOPHY — YEAR 1, SEMESTER 2 ───
    { code: 'PHI102', name: 'Argument and Critical Thinking', department: 'philosophy', year: 1, semester: 2, description: 'Study of argumentation and critical thinking.' },
    { code: 'PHI105', name: 'Ancient Philosophy', department: 'philosophy', year: 1, semester: 2, description: 'Study of ancient philosophical traditions.' },
    { code: 'BLH102', name: 'Latin II', department: 'philosophy', year: 1, semester: 2, description: 'Continuation of Latin.' },
    { code: 'BCG102', name: 'Introduction to New Testament Greek II', department: 'philosophy', year: 1, semester: 2, description: 'Continuation of NT Greek.' },
    { code: 'BGES104', name: 'Speech Techniques', department: 'philosophy', year: 1, semester: 2, description: 'Public speaking and speech techniques.' },
    { code: 'BSTH107B', name: 'Spiritual Theology (Sem 2)', department: 'philosophy', year: 1, semester: 2, description: 'Continuation of spiritual theology.' },
    { code: 'GES104', name: 'Science, Industry and Mankind', department: 'philosophy', year: 1, semester: 2, description: 'Science and society.' },
    { code: 'GES107', name: 'Reproductive Health', department: 'philosophy', year: 1, semester: 2, description: 'Health education.' },
    { code: 'BGES105', name: 'Research Methodology', department: 'philosophy', year: 1, semester: 2, description: 'Introduction to research methods.' },
    { code: 'BPSY201', name: 'Introduction to Psychology', department: 'philosophy', year: 1, semester: 2, description: 'Basic psychology.' },
    { code: 'GES201', name: 'Use of English 2', department: 'philosophy', year: 1, semester: 2, description: 'Continued English language skills.' },

    // ─── PHILOSOPHY — YEAR 2, SEMESTER 1 ───
    { code: 'PHI201', name: 'Introduction to Epistemology', department: 'philosophy', year: 2, semester: 1, description: 'Study of knowledge and epistemology.' },
    { code: 'PHI202', name: 'Introduction to Logic', department: 'philosophy', year: 2, semester: 1, description: 'Formal and informal logic.' },
    { code: 'PHI203', name: 'Ethics', department: 'philosophy', year: 2, semester: 1, description: 'Introduction to ethical theory.' },
    { code: 'PHI204', name: 'Medieval Philosophy', department: 'philosophy', year: 2, semester: 1, description: 'Study of medieval philosophical thought.' },
    { code: 'PHI208', name: 'Philosophy of Nature (Cosmology)', department: 'philosophy', year: 2, semester: 1, description: 'Philosophy of the natural world.' },
    { code: 'PHI206', name: 'Introduction to Metaphysics', department: 'philosophy', year: 2, semester: 1, description: 'Introduction to metaphysical thought.' },
    { code: 'BPHI210', name: 'Christianity and Philosophy', department: 'philosophy', year: 2, semester: 1, description: 'Relationship between Christianity and philosophy.' },
    { code: 'BSOC201', name: 'Sociology', department: 'philosophy', year: 2, semester: 1, description: 'Introduction to sociology.' },
    { code: 'BMI201', name: 'Italian I', department: 'philosophy', year: 2, semester: 1, description: 'Introduction to Italian language.' },
    { code: 'ECO201', name: 'Introduction to Accounting', department: 'philosophy', year: 2, semester: 1, description: 'Basic accounting principles.' },
    { code: 'BSTH211', name: 'Spiritual Theology (Yr 2)', department: 'philosophy', year: 2, semester: 1, description: 'Year 2 spiritual theology.' },

    // ─── PHILOSOPHY — YEAR 2, SEMESTER 2 ───
    { code: 'PHI102B', name: 'Argument and Critical Thinking II', department: 'philosophy', year: 2, semester: 2, description: 'Advanced argumentation.' },
    { code: 'PHI103', name: 'Philosophy of Value', department: 'philosophy', year: 2, semester: 2, description: 'Study of value theory.' },
    { code: 'PHI205', name: 'Introduction to Political Philosophy', department: 'philosophy', year: 2, semester: 2, description: 'Political philosophy foundations.' },
    { code: 'PHI207', name: 'Introduction to African Philosophy', department: 'philosophy', year: 2, semester: 2, description: 'African philosophical traditions.' },
    { code: 'BPHI203', name: 'Philosophy of God', department: 'philosophy', year: 2, semester: 2, description: 'Philosophical study of God.' },
    { code: 'BMI202', name: 'Italian II', department: 'philosophy', year: 2, semester: 2, description: 'Continuation of Italian.' },
    { code: 'BLI201', name: 'Igbo Grammar II', department: 'philosophy', year: 2, semester: 2, description: 'Continuation of Igbo grammar.' },
    { code: 'BUS201', name: 'Introduction to Business Administration', department: 'philosophy', year: 2, semester: 2, description: 'Basic business administration.' },
    { code: 'BLA201', name: 'Law of Contract', department: 'philosophy', year: 2, semester: 2, description: 'Introduction to contract law.' },
    { code: 'BPSY202', name: 'Development of Psychology', department: 'philosophy', year: 2, semester: 2, description: 'Development psychology.' },
    { code: 'BSTH211B', name: 'Spiritual Theology (Yr 2 Sem 2)', department: 'philosophy', year: 2, semester: 2, description: 'Continuation of spiritual theology.' },

    // ─── PHILOSOPHY — YEAR 3, SEMESTER 1 ───
    { code: 'PHI301', name: 'Metaphysics', department: 'philosophy', year: 3, semester: 1, description: 'Advanced metaphysics.' },
    { code: 'PHI302', name: 'Symbolic Logic', department: 'philosophy', year: 3, semester: 1, description: 'Formal symbolic logic.' },
    { code: 'PHI304', name: 'Ethical Theories', department: 'philosophy', year: 3, semester: 1, description: 'Advanced ethical theories.' },
    { code: 'PHI305', name: 'Social and Political Philosophy', department: 'philosophy', year: 3, semester: 1, description: 'Social and political thought.' },
    { code: 'PHI306', name: 'Early Modern Philosophy', department: 'philosophy', year: 3, semester: 1, description: 'Early modern philosophical traditions.' },
    { code: 'PHI307', name: 'Philosophy of Literature', department: 'philosophy', year: 3, semester: 1, description: 'Philosophy and literature.' },
    { code: 'PHI309', name: 'Philosophy of Literature II', department: 'philosophy', year: 3, semester: 1, description: 'Advanced philosophy of literature.' },
    { code: 'PHI310', name: 'Modification of Research and Writing', department: 'philosophy', year: 3, semester: 1, description: 'Research and academic writing.' },
    { code: 'BPHI208', name: 'Philosophy of Language and Communication', department: 'philosophy', year: 3, semester: 1, description: 'Language and communication philosophy.' },
    { code: 'BSTH315', name: 'Apostolic Vocation', department: 'philosophy', year: 3, semester: 1, description: 'Study of apostolic vocation.' },
    { code: 'BPSY302', name: 'Psychology of Religion', department: 'philosophy', year: 3, semester: 1, description: 'Psychology and religion.' },
    { code: 'GES301', name: 'Introduction to Entrepreneurship Skills', department: 'philosophy', year: 3, semester: 1, description: 'Entrepreneurship basics.' },
    { code: 'BSOC301', name: 'Sociology of Religion', department: 'philosophy', year: 3, semester: 1, description: 'Sociology and religion.' },

    // ─── PHILOSOPHY — YEAR 3, SEMESTER 2 ───
    { code: 'PHI303', name: 'Hermeneutics: Continental African Philosophy', department: 'philosophy', year: 3, semester: 2, description: 'Hermeneutics and African philosophy.' },
    { code: 'PHI311', name: 'Philosophy of Religion', department: 'philosophy', year: 3, semester: 2, description: 'Philosophy of religion.' },
    { code: 'PHI312', name: 'Aesthetics', department: 'philosophy', year: 3, semester: 2, description: 'Study of aesthetics.' },
    { code: 'PHI313', name: 'Social and Political Philosophy in Africa', department: 'philosophy', year: 3, semester: 2, description: 'African social and political philosophy.' },
    { code: 'PHI315', name: 'Asian Philosophy', department: 'philosophy', year: 3, semester: 2, description: 'Study of Asian philosophical traditions.' },
    { code: 'PHI318', name: 'Philosophy in Practice', department: 'philosophy', year: 3, semester: 2, description: 'Applied philosophy.' },
    { code: 'PHI320', name: 'Kant – Critique of Pure Reason', department: 'philosophy', year: 3, semester: 2, description: 'Study of Kant\'s Critique of Pure Reason.' },
    { code: 'PHI321', name: 'Augustine – On Free Will', department: 'philosophy', year: 3, semester: 2, description: 'Study of Augustine on free will.' },
    { code: 'BAF301', name: 'African Traditional Religion', department: 'philosophy', year: 3, semester: 2, description: 'African traditional religious thought.' },
    { code: 'BGES105B', name: 'Research Methodology II', department: 'philosophy', year: 3, semester: 2, description: 'Advanced research methodology.' },
    { code: 'BSTH315B', name: 'Apostolic Vocation (Sem 2)', department: 'philosophy', year: 3, semester: 2, description: 'Continuation of apostolic vocation.' },

    // ─── PHILOSOPHY — YEAR 4, SEMESTER 1 ───
    { code: 'PHI401', name: 'Epistemology', department: 'philosophy', year: 4, semester: 1, description: 'Advanced epistemology.' },
    { code: 'PHI402', name: 'Topics in Logic', department: 'philosophy', year: 4, semester: 1, description: 'Advanced topics in logic.' },
    { code: 'PHI403', name: 'Applied Ethics', department: 'philosophy', year: 4, semester: 1, description: 'Applied ethical theory.' },
    { code: 'PHI404', name: 'Marxist Philosophy', department: 'philosophy', year: 4, semester: 1, description: 'Study of Marxist philosophy.' },
    { code: 'PHI405', name: 'Comparative Philosophy', department: 'philosophy', year: 4, semester: 1, description: 'Comparative philosophical traditions.' },
    { code: 'PHI406', name: 'Recent Modern Philosophy', department: 'philosophy', year: 4, semester: 1, description: 'Recent modern philosophical thought.' },
    { code: 'PHI407', name: 'Issues in African Philosophy', department: 'philosophy', year: 4, semester: 1, description: 'Contemporary African philosophy.' },
    { code: 'PHI408', name: 'Phenomenology: Existentialism and Hermeneutics', department: 'philosophy', year: 4, semester: 1, description: 'Phenomenological philosophy.' },
    { code: 'PHI413', name: 'Philosophy of Mind', department: 'philosophy', year: 4, semester: 1, description: 'Philosophy of mind and consciousness.' },
    { code: 'BPHI407', name: 'Analytic Philosophy', department: 'philosophy', year: 4, semester: 1, description: 'Study of analytic philosophy.' },
    { code: 'BSTH413', name: 'Development of Spiritual Life', department: 'philosophy', year: 4, semester: 1, description: 'Spiritual development.' },

    // ─── PHILOSOPHY — YEAR 4, SEMESTER 2 ───
    { code: 'PHI411', name: 'Philosophy of Law', department: 'philosophy', year: 4, semester: 2, description: 'Legal philosophy.' },
    { code: 'PHI412', name: 'Philosophy of History', department: 'philosophy', year: 4, semester: 2, description: 'Philosophy of history.' },
    { code: 'PHI414', name: 'Philosophy of Language', department: 'philosophy', year: 4, semester: 2, description: 'Language and philosophy.' },
    { code: 'PHI415', name: 'Philosophy in Practice II', department: 'philosophy', year: 4, semester: 2, description: 'Advanced applied philosophy.' },
    { code: 'PHI417', name: 'Twentieth Century Analytic Philosophy', department: 'philosophy', year: 4, semester: 2, description: '20th century analytic tradition.' },
    { code: 'PHI418', name: 'Post Analytic Philosophy', department: 'philosophy', year: 4, semester: 2, description: 'Post-analytic philosophical thought.' },
    { code: 'PHI420', name: 'Heidegger: Being and Time', department: 'philosophy', year: 4, semester: 2, description: 'Study of Heidegger\'s Being and Time.' },
    { code: 'BPHI406', name: 'Topics in Metaphysics', department: 'philosophy', year: 4, semester: 2, description: 'Advanced metaphysical topics.' },
    { code: 'BPHI411', name: 'Metaphysical Study of Man', department: 'philosophy', year: 4, semester: 2, description: 'Metaphysics of human nature.' },
    { code: 'PHI416', name: 'Memoir', department: 'philosophy', year: 4, semester: 2, description: 'Final year memoir/thesis.' },
];

async function seed() {
    console.log(`Seeding ${courses.length} courses...`);
    for (const course of courses) {
        await addDoc(collection(db, 'courses'), {
            ...course,
            createdAt: new Date().toISOString(),
        });
        console.log(`✓ ${course.code} — ${course.name}`);
    }
    console.log('All courses seeded!');
    process.exit(0);
}

seed().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});