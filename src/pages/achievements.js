import React from 'react';
import { Typography, Box } from '@mui/material';
import { achievementItems } from '../components/items/achievementItems';
import { extracurricularItems } from '../components/items/extracurricularItems';
import AchievementTab from '../components/AchievementTab';
import PageSurface from '../components/PageSurface';
import { palette } from '../styles/theme';

const Section = ({ eyebrow, title, items, describe }) => (
  <Box sx={{ mt: 6, '&:first-of-type': { mt: 0 } }}>
    <Typography variant="overline" component="p">{eyebrow}</Typography>
    <Typography variant="h3" component="h2" sx={{ mb: 1 }}>{title}</Typography>
    <Box aria-hidden sx={{ width: 48, height: 2, backgroundColor: palette.flame, mb: 3 }} />
    <Box display="flex" flexDirection="column" gap={2}>
      {items.map((item, index) => (
        <AchievementTab
          key={`${item.name}-${item.year ?? index}`}
          index={index}
          achievement={{ name: item.name, date: item.year, url: item.url }}
          description={describe ? describe(item) : undefined}
        />
      ))}
    </Box>
  </Box>
);

const byCategory = (c) => achievementItems.filter((a) => a.category === c);

function Achievements() {
  return (
    <PageSurface eyebrow="Olympiads & awards" title="Achievements">
      <Typography variant="body1" sx={{ mb: 1 }}>
        Eighteen national and international medals across informatics and mathematics,
        earned between 2015 and 2022 — most notably a bronze medal at the Northwestern
        European Regional Contest and a gold at the Ibero-American Olympiad of Mathematics.
      </Typography>

      <Section
        eyebrow="Contests & informatics"
        title="Competitive programming"
        items={byCategory('informatics')}
      />

      <Section
        eyebrow="Olympiads"
        title="Mathematics"
        items={byCategory('mathematics')}
      />

      {/* This content already existed in extracurricularItems.js but had no
          route pointing at it, so nothing on the site ever rendered it. */}
      <Section
        eyebrow="Outside the course"
        title="Extracurricular"
        items={extracurricularItems.map((i) => ({ ...i, year: i.date }))}
        describe={(i) => i.description}
      />
    </PageSurface>
  );
}

export default Achievements;
