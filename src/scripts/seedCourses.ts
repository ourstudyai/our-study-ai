const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccount.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const courses = [

    // ─── PHILOSOPHY YEAR 1 — SEMESTER 1 ───
    { code: 'PHI101', name: 'Introduction to Philosophy', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'PHI101B', name: 'Knowing Philosophy', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'PHI106', name: 'Plato: Symposium', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'PHI107', name: 'Aristotelian Logic', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BLH101', name: 'Latin', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BCG101', name: 'Introduction to NT Greek', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BCS101', name: 'Introduction to Scripture', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BAF101', name: 'African Art & Culture', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BSTH107', name: 'Spiritual Theology', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'GES101', name: 'Use of English 1', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'GES106', name: 'Logic and Critical Thinking', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BLI101', name: 'Igbo Grammar', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BHI213', name: 'Philosophy of Education', department: 'philosophy', year: 1, semester: 1, description: '' },
    { code: 'BMI201', name: 'Italian I', department: 'philosophy', year: 1, semester: 1, description: '' },

    // ─── PHILOSOPHY YEAR 1 — SEMESTER 2 ───
    { code: 'BSTH107-P1S2', name: 'Spiritual Theology', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'PHI105', name: 'Ancient Philosophy', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'BGES104', name: 'Speech Techniques', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'BMI202', name: 'Italian II', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'BCG102', name: 'Introduction to NT Greek II', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'BLH102', name: 'Latin II', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'PHI102', name: 'Argument and Critical Thinking', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'GES107', name: 'Reproductive Health', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'GES104', name: 'Science and Mankind', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'PHI103', name: 'Philosophy of Value', department: 'philosophy', year: 1, semester: 2, description: '' },
    { code: 'BGES105', name: 'Research Methodology', department: 'philosophy', year: 1, semester: 2, description: '' },
    // ─── PHILOSOPHY YEAR 2 — SEMESTER 1 ───
    { code: 'PHI202', name: 'Introduction to Logic', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'PHI203', name: 'Ethics', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'PHI204', name: 'Medieval Philosophy', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'PHI208', name: 'Philosophy of Nature (Cosmology)', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'PHI206', name: 'Introduction to Metaphysics', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'BPHI210', name: 'Christianity and Philosophy', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'BSOC201', name: 'Sociology', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'ECO201', name: 'Introduction to Accounting', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'BSTH211', name: 'Spiritual Theology (Yr 2)', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'PHI103-P2S1', name: 'Philosophy of Value', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'PHI110', name: 'Aristotle: Nicomachean Ethics', department: 'philosophy', year: 2, semester: 1, description: '' },
    { code: 'GES105', name: 'Agricultural Science', department: 'philosophy', year: 2, semester: 1, description: '' },

    // ─── PHILOSOPHY YEAR 2 — SEMESTER 2 ───
    { code: 'PHI205', name: 'Introduction to Political Philosophy', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'PHI207', name: 'Introduction to African Philosophy', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BPHI203', name: 'Philosophy of God', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BLI201', name: 'Igbo Grammar II', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BUS201', name: 'Introduction to Business Administration', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BLA201', name: 'Law of Contract', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BPSY202', name: 'Development of Psychology', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BSTH211B', name: 'Spiritual Theology (Yr 2 Sem 2)', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'PHI201', name: 'Introduction to Epistemology', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BPSY201', name: 'Introduction to Psychology', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BPHI209', name: 'Introduction to Phil. Anthropology', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'BPHI206', name: 'Ethical Values', department: 'philosophy', year: 2, semester: 2, description: '' },
    { code: 'GES201', name: 'English Language', department: 'philosophy', year: 2, semester: 2, description: '' },

    // ─── PHILOSOPHY YEAR 3 — SEMESTER 1 ───
    { code: 'PHI301', name: 'Metaphysics', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI304', name: 'Philosophy of Science', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI305', name: 'Social & Political Philosophy', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI306', name: 'Early Modern Philosophy', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI307', name: 'African Philosophy', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI309', name: 'Philosophy of Literature', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI310', name: 'Methodology of Research & Writing', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'PHI319', name: 'Descartes: Discourse on Method', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'BSTH315', name: 'Apostolic Vocation', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'BSOC301', name: 'Sociology of Religion', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'BPSY302', name: 'Psychology of Religion', department: 'philosophy', year: 3, semester: 1, description: '' },
    { code: 'GES301', name: 'Introduction to Entrepreneurial Skills', department: 'philosophy', year: 3, semester: 1, description: '' },

    // ─── PHILOSOPHY YEAR 3 — SEMESTER 2 ───
    { code: 'PHI302', name: 'Ethical Theories', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI303', name: 'African Philosophy', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI311', name: 'Philosophy of Religion', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI312', name: 'Ancient Philosophy', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI313', name: 'Social & Political Philosophy', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI318', name: 'Symbolic Logic', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI320', name: 'Aquinas: Being & Essence', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI321', name: 'Augustine: On Free Will', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'BPHI302', name: 'African Traditional Religion', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'BSTH315-P3S2', name: 'Apostolic Vocation', department: 'philosophy', year: 3, semester: 2, description: '' },
    { code: 'PHI300', name: 'Philosophy in Practice', department: 'philosophy', year: 3, semester: 2, description: '' },

    // ─── PHILOSOPHY YEAR 4 — SEMESTER 1 ───
    { code: 'PHI401', name: 'Epistemology', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'PHI402', name: 'Topics in Logic', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'PHI405', name: 'Comparative Philosophy', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'PHI406', name: 'Recent Modern Philosophy', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'PHI408', name: 'Phenomenology: Existentialism and Hermeneutics', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'PHI413', name: 'Philosophy of Mind', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'BPHI407', name: 'Analytic Philosophy', department: 'philosophy', year: 4, semester: 1, description: '' },
    { code: 'PHI420', name: 'Heidegger: Being and Time', department: 'philosophy', year: 4, semester: 1, description: '' },

    // ─── PHILOSOPHY YEAR 4 — SEMESTER 2 ───
    { code: 'PHI411', name: 'Philosophy of Law', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI412', name: 'Philosophy of History', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI414', name: 'Philosophy of Language', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI417', name: 'Twentieth Century Analytic Philosophy', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI418', name: 'Post Analytic Philosophy', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'BPHI406', name: 'Topics in Metaphysics', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'BPHI411', name: 'Metaphysical Study of Man', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI404', name: 'Marxist Philosophy', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI407', name: 'Issues in African Philosophy', department: 'philosophy', year: 4, semester: 2, description: '' },
    { code: 'PHI403', name: 'Applied Ethics', department: 'philosophy', year: 4, semester: 2, description: '' },
    // ─── THEOLOGY YEAR 1 — SEMESTER 1 ───
    { code: 'CL101-T1S1', name: 'Canon Law', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'CCH101-T1S1', name: 'Church History', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'BLG101', name: 'Greek', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'BHE101', name: 'Hebrew', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO101', name: 'Fundamentals of Scripture', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO102', name: 'Apologetics', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO103', name: 'Mariology', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO104-T1S1', name: 'Moral Theology', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO107-T1S1', name: 'Sacramental Theology', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO108-T1S1', name: 'Fundamental Moral Theology', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO111-T1S1', name: 'De Deo Uno et Trino', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO113-T1S1', name: 'Synoptic Gospels', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO121-T1S1', name: 'Hebrew', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO131', name: 'Environment & Times of NT', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'THEO132-T1S1', name: 'Pentateuch & Historical Books', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'PAT101-T1S1', name: 'Patrology', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'SPTH101-T1S1', name: 'Spiritual Theology', department: 'theology', year: 1, semester: 1, description: '' },
    { code: 'ENG101-T1S1', name: 'Use of English', department: 'theology', year: 1, semester: 1, description: '' },

    // ─── THEOLOGY YEAR 1 — SEMESTER 2 ───
    { code: 'CL101-T1S2', name: 'Canon Law', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'CCH101-T1S2', name: 'Church History', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'BLG102', name: 'Greek II', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'BHE102', name: 'Hebrew II', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO101-T1S2', name: 'Fundamentals of Scripture', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO104-T1S2', name: 'Moral Theology', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO105', name: 'Basileia tou Theou', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO107-T1S2', name: 'Sacramental Theology', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO108-T1S2', name: 'Fundamental Moral Theology', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO111-T1S2', name: 'De Deo Uno et Trino', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO112', name: 'Intro to Method of NT Exegesis', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO113-T1S2', name: 'Synoptic Gospels and Acts', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO121-T1S2', name: 'Fundamental Theology', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'THEO132-T1S2', name: 'Pentateuch & Historical Books', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'PAT101-T1S2', name: 'Patrology', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'SPTH101-T1S2', name: 'Spiritual Theology', department: 'theology', year: 1, semester: 2, description: '' },
    { code: 'ENG101-T1S2', name: 'Use of English', department: 'theology', year: 1, semester: 2, description: '' },

    // ─── THEOLOGY YEAR 2 — SEMESTER 1 ───
    { code: 'CL201-T2S1', name: 'Canon Law', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'CCH201-T2S1', name: 'Church History', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'THEO201-T2S1', name: 'Fundamental Moral Theology', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'THEO204-T2S1', name: 'Prophets of the OT', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'THEO205-T2S1', name: 'Grace', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'THEO211-T2S1', name: 'OT Historical Books', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'THEO214-T2S1', name: 'NT Exegesis (Yr 2)', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'THEO309-T2S1', name: 'De Deo Uno et Trino', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'MIS201-T2S1', name: 'Missiology', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'BLG201-T2S1', name: 'Greek II', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'BLH201-T2S1', name: 'Hebrew II', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'SPTH201-T2S1', name: 'Spiritual Theology', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'PSTH204-T2S1', name: 'Pastoral Theology', department: 'theology', year: 2, semester: 1, description: '' },
    { code: 'PAT201-T2S1', name: 'Patrology II', department: 'theology', year: 2, semester: 1, description: '' },

    // ─── THEOLOGY YEAR 2 — SEMESTER 2 ───
    { code: 'CL201-T2S2', name: 'Canon Law', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'CCH201-T2S2', name: 'Church History', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO201-T2S2', name: 'Sacred Scripture', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO203', name: 'Christology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO204-T2S2', name: 'Moral Theology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO205-T2S2', name: 'Sacramental Theology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO211-T2S2', name: 'Sacred Writing Corpus Johanneum', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO214-T2S2', name: 'Liturgy', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO305-T2S2', name: 'Ecclesiology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'THEO309-T2S2', name: 'Catholic Social Teaching', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'MIS201-T2S2', name: 'Missiology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'BLG201-T2S2', name: 'Biblical Greek', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'BLH201-T2S2', name: 'Biblical Hebrew', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'SPTH201-T2S2', name: 'Spiritual Theology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'PSTH204-T2S2', name: 'Pastoral Theology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'PAT201-T2S2', name: 'Patrology', department: 'theology', year: 2, semester: 2, description: '' },
    { code: 'METH-T2S2', name: 'Research Methodology', department: 'theology', year: 2, semester: 2, description: '' },
    // ─── THEOLOGY YEAR 3 — SEMESTER 1 ───
    { code: 'CL301-T3S1', name: 'Canon Law', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'HOM-T3S1', name: 'Homiletics', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'PSTH401-T3S1', name: 'Pastoral Theology', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'PSY302-T3S1', name: 'Pastoral Psychology', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO204-T3S1', name: 'Prophets of the OT', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO302-T3S1', name: 'Christology', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO305-T3S1', name: 'Ecclesiology', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO308-T3S1', name: 'Virtue of Religion', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO314-T3S1', name: 'NT Exegesis: John and Revelation', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO317-T3S1', name: 'Liturgy', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO401-T3S1', name: 'De Resurrectio', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO403-T3S1', name: 'Sacramental Theology', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO407-T3S1', name: 'Moral Theology', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO408-T3S1', name: 'OT Exegesis: Wisdom Literature and Psalms', department: 'theology', year: 3, semester: 1, description: '' },
    { code: 'THEO415-T3S1', name: 'NT Exegesis: Pauline Corpus', department: 'theology', year: 3, semester: 1, description: '' },

    // ─── THEOLOGY YEAR 3 — SEMESTER 2 ───
    { code: 'CL301-T3S2', name: 'Canon Law', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'PSY302-T3S2', name: 'Pastoral Psychology', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO204-T3S2', name: 'Prophets of the OT', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO302-T3S2', name: 'Christology', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO307', name: 'Catechetics', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO308-T3S2', name: 'Virtue of Religion', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO314-T3S2', name: 'NT Exegesis: John and Revelation', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO317-T3S2', name: 'Liturgy', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO403-T3S2', name: 'Sacramental Theology', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO407-T3S2', name: 'Moral Theology', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO408-T3S2', name: 'OT Exegesis: Wisdom Literature and Psalms', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO409-T3S2', name: 'OT Exegesis: Theology of the OT Prophets', department: 'theology', year: 3, semester: 2, description: '' },
    { code: 'THEO415-T3S2', name: 'NT Exegesis: Pauline Corpus', department: 'theology', year: 3, semester: 2, description: '' },

    // ─── THEOLOGY YEAR 4 — SEMESTER 1 ───
    { code: 'CLP-T4S1', name: 'Canon Law Praxis', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'HOM-T4S1', name: 'Homiletics', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'PENTE-T4S1', name: 'Pentecostalism', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'PSY401-T4S1', name: 'Psychology', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'PSTH401-T4S1', name: 'Pastoral Theology', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO132-T4S1', name: 'Pentateuch & Historical Books', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO313-T4S1', name: 'NT: Synoptic Gospels and Acts of the Apostles', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO403-T4S1', name: 'Sacramental Theology', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO404-T4S1', name: 'Christology', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO407-T4S1', name: 'Moral Theology', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO408-T4S1', name: 'OT Exegesis: Wisdom Literature and Psalms', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO409-T4S1', name: 'OT Exegesis: Theology of the OT Prophets', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO415-T4S1', name: 'NT Exegesis: Pauline Corpus', department: 'theology', year: 4, semester: 1, description: '' },
    { code: 'THEO417-T4S1', name: 'Liturgy Praxis', department: 'theology', year: 4, semester: 1, description: '' },

    // ─── THEOLOGY YEAR 4 — SEMESTER 2 ───
    { code: 'CL401', name: 'Canon Law', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'CLP-T4S2', name: 'Canon Law Praxis', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'HOM-T4S2', name: 'Homiletics', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'PENTE-T4S2', name: 'Pentecostalism', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'PSY401-T4S2', name: 'Psychology', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'PSTH401-T4S2', name: 'Pastoral Theology', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO313-T4S2', name: 'NT: Synoptic Gospels and Acts of the Apostles', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO314-T4S2', name: 'NT Exegesis: John and Revelation', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO401-T4S2', name: 'De Novissimi', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO403-T4S2', name: 'Sacramental Theology', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO404-T4S2', name: 'Christology', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO407-T4S2', name: 'Moral Theology', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO408-T4S2', name: 'OT Exegesis: Wisdom Literature and Psalms', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO409-T4S2', name: 'OT Exegesis: Theology of the OT Prophets', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO415-T4S2', name: 'NT Exegesis: Pauline Corpus', department: 'theology', year: 4, semester: 2, description: '' },
    { code: 'THEO417-T4S2', name: 'Liturgy Praxis', department: 'theology', year: 4, semester: 2, description: '' },

];
async function seed() {
    console.log(`Seeding ${courses.length} courses...`);
    for (const course of courses) {
        await db.collection('courses').add({
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
