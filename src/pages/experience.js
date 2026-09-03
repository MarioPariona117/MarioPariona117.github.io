import React from 'react';
import { Typography, Box } from '@mui/material';
import {
  workExperience,
  teachingExperience,
  education,
  volunteering,
  skills,
} from '../components/items/experienceItems';
import PageSurface from '../components/PageSurface';
import { palette } from '../styles/theme';

const Role = ({ item }) => (
  <Box
    component="article"
    sx={{
      p: 2.25,
      border: `1px solid ${palette.hairline}`,
      borderLeft: '2px solid transparent',
      borderRadius: '4px',
      backgroundColor: 'background.paper',
      transition: 'border-color .2s, background .2s, transform .2s',
      '&:hover': {
        borderLeftColor: palette.flame,
        backgroundColor: palette.cardHover,
        transform: 'translateX(2px)',
      },
    }}
  >
    <Typography variant="h6" component="h3" sx={{ mb: 0.25 }}>
      {item.role}
    </Typography>
    <Typography variant="body2" sx={{ mb: 1.5 }}>
      {item.company} · {item.location} · {item.period}
    </Typography>
    <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 } }}>
      {item.bullets.map((b, i) => (
        <Typography key={i} component="li" variant="body1" sx={{ mb: 0 }}>
          {b}
        </Typography>
      ))}
    </Box>
  </Box>
);

const Section = ({ eyebrow, title, items, first }) => (
  <Box sx={{ mt: first ? 0 : 6 }}>
    <Typography variant="overline" component="p">{eyebrow}</Typography>
    <Typography variant="h3" component="h2" sx={{ mb: 1 }}>{title}</Typography>
    <Box aria-hidden sx={{ width: 48, height: 2, backgroundColor: palette.flame, mb: 3 }} />
    <Box display="flex" flexDirection="column" gap={2}>
      {items.map((item) => (
        <Role key={`${item.company}-${item.role}`} item={item} />
      ))}
    </Box>
  </Box>
);

const Experience = () => (
  <PageSurface eyebrow="Where I've worked" title="Experience">
    <Section first eyebrow="Roles" title="Work" items={workExperience} />
    <Section eyebrow="Degree" title="Education" items={education} />
    <Section eyebrow="Coaching & instruction" title="Teaching" items={teachingExperience} />
    <Section eyebrow="Service" title="Volunteering" items={volunteering} />

    <Box sx={{ mt: 6 }}>
      <Typography variant="overline" component="p">What I work with</Typography>
      <Typography variant="h3" component="h2" sx={{ mb: 1 }}>Skills</Typography>
      <Box aria-hidden sx={{ width: 48, height: 2, backgroundColor: palette.flame, mb: 3 }} />
      <Box display="flex" flexDirection="column" gap={2}>
        {skills.map((group) => (
          <Box
            key={group.title}
            sx={{
              p: 2.25,
              border: `1px solid ${palette.hairline}`,
              borderRadius: '4px',
              backgroundColor: 'background.paper',
            }}
          >
            <Typography variant="overline" component="p" sx={{ mb: 0.25 }}>
              {group.title}
            </Typography>
            <Typography variant="body1" sx={{ mb: 0 }}>{group.items}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  </PageSurface>
);

export default Experience;
