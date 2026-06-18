/* UTM Foundation Hub — content catalog (Semester data) */
window.HUB_DATA = {
  brand: "UTM Foundation Hub",
  tagline: "Your complete Foundation in Science study companion",
  subjects: [
    {
      id: "calculus",
      name: "Calculus",
      code: "FSPM0024",
      icon: "📈",
      color: "#8c1d40",
      blurb: "Limits, differentiation, integration, ODEs and numerical methods — the mathematics of change.",
      lessons: "lessons-calculus.html",
      topics: [
        "Limits & Continuity", "Differentiation", "Applications of Differentiation",
        "Integration", "Integration of Trigonometric Functions", "Applications of Integration",
        "Ordinary Differential Equations", "Numerical Methods"
      ],
      papers: { slides: 8, tutorials: 6, tests: 10, finals: 6 }
    },
    {
      id: "physics",
      name: "Physics II",
      code: "FSPP0034",
      icon: "🔬",
      color: "#1d6b8c",
      blurb: "Electricity, magnetism, optics and modern physics across 13 connected chapters.",
      lessons: "",
      topics: [
        "Electrostatics", "Capacitors", "Current & Resistance", "DC Circuits", "Magnetism",
        "Electromagnetic Induction", "Electromagnetic Waves", "Reflection & Refraction", "Lenses",
        "Interference & Diffraction", "Quantum Theory of the Atom", "Nuclear Physics", "Nuclear Reactions"
      ],
      papers: { slides: 13, tutorials: 6, tests: 6, finals: 5 }
    },
    {
      id: "chemistry",
      name: "Chemistry II",
      code: "IFC1024",
      icon: "⚗️",
      color: "#2e8c4f",
      blurb: "Thermochemistry, kinetics, equilibrium, acids & bases, and organic chemistry.",
      lessons: "",
      topics: [
        "Thermochemistry", "Chemical Kinetics", "Chemical Equilibrium", "Acids & Bases", "Organic Chemistry"
      ],
      papers: { slides: 5, tutorials: 6, tests: 11, finals: 14 }
    },
    {
      id: "computing",
      name: "Fundamentals of Computing",
      code: "FSPK0022",
      icon: "💻",
      color: "#6b3d8c",
      blurb: "Programming in the C language — from how computers work to functions and files.",
      lessons: "",
      topics: [
        "Introduction to IT", "Programming Concepts", "Programming Environment",
        "Elementary Programming", "Input & Output", "Branching & Loops", "Files", "Functions"
      ],
      papers: { slides: 12, tutorials: 0, tests: 0, finals: 0 }
    },
    {
      id: "english",
      name: "Academic Listening & Speaking",
      code: "FSPE0022",
      icon: "🗣️",
      color: "#b8761d",
      blurb: "Confident academic English: impromptu speech, presentations, discussion and listening.",
      lessons: "",
      topics: [
        "Impromptu Speech (2×10%)", "Oral Presentation (10%)", "Group Discussion (10%)",
        "Listening Test (2×10%)", "Final Listening Exam (40%)"
      ],
      papers: { other: 1, note: "Assessment specs & rubrics" }
    },
    {
      id: "statistics",
      name: "Statistics & Probability",
      code: "FSPM",
      icon: "📊",
      color: "#8c5a1d",
      blurb: "Descriptive statistics, probability, distributions and data analysis.",
      lessons: "",
      topics: [
        "Descriptive Statistics", "Probability", "Probability Distributions", "Data Analysis"
      ],
      papers: { other: 9, note: "Notes & papers" }
    }
  ]
};
