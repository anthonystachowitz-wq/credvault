// Generate two 50-student cohort CSVs (granular + monolithic), 10 courses each.
import * as fs from 'node:fs';

// deterministic PRNG (mulberry32) for reproducible data
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const FIRST = ['Ava','Liam','Mia','Noah','Zoe','Ethan','Ruby','Owen','Ivy','Jack','Nora','Leo','Ella','Max','Luna','Sam','Iris','Cole','Faye','Reed','Tess','Hugo','Nina','Kai','June','Milo','Sara','Finn','Wren','Cody','Gail','Bret','Jade','Kent','Lara','Neil','Opal','Paul','Rosa','Seth','Tara','Umar','Vera','Wade','Xena','Yale','Zane','Abby','Burt'];
const LAST = ['Chen','Brooks','Diaz','Ellis','Ford','Gupta','Hayes','Ito','James','Khan','Lopez','Moss','Nguyen','Ortiz','Price','Quinn','Ross','Singh','Tran','Uribe','Vega','Wang','Xu','Young','Zhao','Ali','Baker','Costa','Dunn','Emery','Farrell','Gray','Holt','Ingram','Jensen','Klein','Larsen','Mehta','Nolan','Osborne','Park','Reyes','Stewart','Tanaka','Underwood','Valdez','Webb','Xiong','Yates','Zimmer'];
const COURSES = {
  'B.S. Computer Science': [['CS101','Intro to Computer Science'],['CS201','Programming Languages'],['CS240','Data Structures'],['CS320','Algorithms'],['CS330','Computer Architecture'],['CS360','Operating Systems'],['CS410','Databases'],['CS420','Networks'],['CS460','Machine Learning'],['CS470','Software Engineering'],['MATH420','Cryptography'],['STAT310','Probability']],
  'B.A. Economics': [['ECON101','Microeconomics'],['ECON210','Macroeconomics'],['ECON240','International Trade'],['ECON310','Game Theory'],['ECON340','Econometrics'],['FIN220','Corporate Finance'],['STAT200','Statistics'],['MATH210','Linear Algebra'],['ECON410','Public Economics'],['HIST240','Economic History']],
  'B.S. Mechanical Engineering': [['ME101','Engineering Mechanics'],['ME210','Thermodynamics'],['ME230','Materials Science'],['ME310','Fluid Mechanics'],['ME330','Machine Design'],['ME410','Heat Transfer'],['ME420','Control Systems'],['MATH251','Differential Equations'],['PHYS121','Physics I'],['ENGR300','Engineering Ethics']],
  'B.A. Psychology': [['PSY101','Intro to Psychology'],['PSY210','Cognitive Psychology'],['PSY230','Developmental Psychology'],['PSY310','Abnormal Psychology'],['PSY330','Social Psychology'],['PSY410','Research Methods'],['STAT205','Behavioral Statistics'],['BIO150','Neuroscience'],['SOC210','Sociology'],['PHIL220','Ethics']],
  'B.S. Biology': [['BIO101','General Biology'],['BIO210','Cell Biology'],['BIO305','Genetics'],['BIO320','Ecology'],['BIO410','Microbiology'],['CHEM110','General Chemistry'],['CHEM210','Organic Chemistry'],['BCHM310','Biochemistry'],['MATH130','Calculus I'],['STAT215','Biostatistics']],
};
const DEGREES = Object.keys(COURSES);
const GRADES = ['A','A-','B+','B','B-','C+','C','A','A-','B+'];

function cohort(prefix, rand) {
  const rows = [];
  for (let i = 1; i <= 50; i++) {
    const id = prefix + '-' + String(i).padStart(3, '0');
    const name = FIRST[Math.floor(rand() * FIRST.length)] + ' ' + LAST[Math.floor(rand() * LAST.length)];
    const degree = DEGREES[Math.floor(rand() * DEGREES.length)];
    const pool = COURSES[degree];
    const picked = [...pool].sort(() => rand() - 0.5).slice(0, 10);
    const gpa = 280 + Math.floor(rand() * 120); // 2.80 – 3.99
    for (const [code, title] of picked) {
      rows.push([id, name, degree, gpa, code, title, 3 + (rand() > 0.7 ? 1 : 0), GRADES[Math.floor(rand() * GRADES.length)]].join(','));
    }
  }
  return rows;
}

const header = 'studentId,fullName,degree,gpa,courseCode,courseTitle,credits,grade\n';
const g = cohort('GRA', rng(42));
const m = cohort('MONO', rng(1337));
fs.writeFileSync('data/batch-granular-50.csv', header + g.join('\n') + '\n');
fs.writeFileSync('data/batch-monolithic-50.csv', header + m.join('\n') + '\n');
console.log('wrote data/batch-granular-50.csv   (' + g.length + ' rows, 50 students, granular)');
console.log('wrote data/batch-monolithic-50.csv (' + m.length + ' rows, 50 students, monolithic)');
