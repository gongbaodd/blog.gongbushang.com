import type { ResumeLanguage, ResumeRole, ResumeEntry } from "./data";
import { education, experience, labels, profile, projects, updated, variants } from "./data";
import classes from "./MantineResume.module.css";

interface IMantineResumeProps {
  role: ResumeRole;
  language: ResumeLanguage;
}

function optimizeImage(url: string, variant: "logo" | "cover") {
  // Display sizes are small (24px logos, ~70px project thumbs); keep
  // downloads tight so the generated PDFs stay under the 2 MB limit.
  const params = variant === "logo" ? "f_auto,q_50,w_96" : "f_auto,q_40,w_240";
  return url.replace("/image/upload/", `/image/upload/${params}/`);
}

function EntryRow({ entry, language }: { entry: ResumeEntry; language: ResumeLanguage }) {
  return (
    <article className={classes.entryRow}>
      {entry.image && <img src={optimizeImage(entry.image, "logo")} alt="" width="24" height="24" />}
      <div>
        <div className={classes.entryTitle}>
          {entry.name[language]}
          {entry.degree && <span className={classes.badge}>{entry.degree}</span>}
          {entry.date && <span className={classes.date}>{entry.date[language]}</span>}
        </div>
        <p>{entry.detail[language]}</p>
        {entry.award && <p><strong>{labels[language].award}:</strong> {entry.award[language]}</p>}
        {entry.tags && (
          <div className={classes.expTags}>
            {entry.tags.map(tag => <span className={classes.badge} key={tag}>{tag}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}

function ProjectMini({ entry, language }: { entry: ResumeEntry; language: ResumeLanguage }) {
  return (
    <a className={classes.projectMini} href={entry.url} target="_blank" rel="noopener noreferrer">
      {entry.image && <img src={optimizeImage(entry.image, "cover")} alt="" width="240" height="120" loading="lazy" />}
      <strong>{entry.name[language]}</strong>
      <span>{entry.detail[language]}</span>
      {entry.award && <span><strong>{labels[language].award}:</strong> {entry.award[language]}</span>}
      {entry.tags && (
        <span className={classes.projectTags}>{entry.tags.slice(0, 3).join(" · ")}</span>
      )}
    </a>
  );
}

export default function MantineResume({ role, language }: IMantineResumeProps) {
  const variant = variants[role];
  const copy = labels[language];
  // Every variant shows exactly 3 rows so the page fills uniformly.
  return (
    <div className={classes.content} lang={language === "zh" ? "zh-CN" : "en"}>
      <div className="A4">
        <section className="sheet padding-10mm" aria-label={`${profile.name[language]} — ${variant.headline[language]}`}>
          <div className={classes.updated}>{copy.updated} {updated}</div>
          <div className={classes.heading}>
            <h1>{profile.name[language]}</h1>
            <span>{profile.otherName[language]}</span>
            <p>{variant.headline[language]}</p>
          </div>
          <p className={classes.summary}>{variant.summary[language]}</p>
          <div className={classes.contact}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.github}>github.com/gongbaodd</a>
            <span>📍 {profile.location[language]}</span>
            <a href={profile.website}>growgen.xyz</a>
            <a href={profile.linkedin}>LinkedIn — Jian Gong</a>
            <span>{copy.nationality}</span>
          </div>
          <div className={classes.body}>
            <div className={classes.main}>
              <h2>{copy.experience}</h2>
              <div className={classes.entries}>
                {variant.experience.map(id => <EntryRow key={id} entry={experience[id]} language={language} />)}
              </div>
              <h2>{copy.projects}</h2>
              {/* Sparse variants (6 projects) use 2 columns so every CV
                  shows 3-4 full rows at the same density. */}
              <div className={classes.projectGrid} style={{ gridTemplateColumns: `repeat(${variant.projects.length > 6 ? 3 : 2}, minmax(0, 1fr))` }}>
                {variant.projects.map(id => <ProjectMini key={id} entry={projects[id]} language={language} />)}
              </div>
            </div>
            <div className={classes.side}>
              <h2>{copy.skills}</h2>
              <div className={classes.skills}>
                {variant.skills.map(item => <div key={item.name}><strong>{item.name}</strong><span>{item.detail[language]}</span></div>)}
              </div>
              <h2>{copy.education}</h2>
              <div className={classes.entries}>
                {variant.education.map(id => <EntryRow key={id} entry={education[id]} language={language} />)}
              </div>
              <h2>{copy.languages}</h2>
              <ul className={classes.languages}>
                {profile.languages.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
