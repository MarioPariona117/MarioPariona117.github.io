import { palette } from '../styles/theme';
import React from 'react';
import { Typography, Box, Grid } from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import CodeIcon from '@mui/icons-material/Code';
import SentimentVerySatisfiedIcon from '@mui/icons-material/SentimentVerySatisfied';
import RosaryIcon from '../assets/RosaryIcon';
import PageSurface from '../components/PageSurface';
import RecollectionDoor from '../components/RecollectionDoor';

const iconSx = { fontSize: 44, color: 'secondary.dark' };

const quickFacts = [
  {
    title: 'Catholic Faith',
    description:
      'Through my faith, I draw strength and motivation, striving to embody the principles of love, humility, compassion and a commitment to serve others.',
    icon: <RosaryIcon sx={iconSx} />,
    // The one place on the site where the faith side is already on the page —
    // so the second, contextual door into /recollection belongs here.
    extra: <RecollectionDoor variant="text" label="More on that →" />,
  },
  {
    title: 'Tech Enthusiast',
    description:
      'Passionate about discovering how Machine Learning can be harnessed to create a more equitable world for all.',
    icon: <CodeIcon sx={iconSx} />,
  },
  {
    title: 'Active Lifestyle',
    description:
      'The joy of movement in running, football, and ultimate frisbee keeps me fit and healthy, bringing balance and energy to my life while keeping me physically and mentally active.',
    icon: <SportsSoccerIcon sx={iconSx} />,
  },
  {
    title: 'Laughter Lover',
    description:
      'I believe that laughter is contagious; there’s nothing quite like the warmth of making others smile and creating moments of genuine connection through humour.',
    icon: <SentimentVerySatisfiedIcon sx={iconSx} />,
  },
];

function About() {
  return (
    <PageSurface eyebrow="Who I am" title="It's-a me, Mario!">
      <Typography
        variant="h6"
        component="p"
        sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 4, fontWeight: 400 }}
      >
        Research Software Engineer · Cambridge Computer Science · Machine Learning
      </Typography>

      <Typography variant="body1" paragraph>
        I'm Mario Pariona. I grew up in Peru, came to Cambridge in 2022 to read Computer
        Science, and stayed on after graduating — I now work as a Research Software
        Engineer at a company here, where I own the computer vision system and the data
        pipeline behind estimating nutritional information from sequences of food
        photographs. Rather more of that job is pipeline work than modelling, which I
        did not expect when I started and have come to enjoy a great deal.
      </Typography>

      <Typography variant="body1" paragraph>
        Mathematics came before any of it. I competed for Peru at international olympiads
        throughout school, winning a gold at the Ibero-American Mathematical Olympiad in
        2021, and only found programming in 2020, by way of competitive programming. The
        two have never really separated in my head. My final-year dissertation was a year
        spent teaching a neural network to play Blokus, and the hardest part of it was
        not the reinforcement learning at all but making the environment fast enough that
        the experiments could run in the first place.
      </Typography>

      <Typography variant="body1" paragraph>
        My faith is at the centre of my life. I am Catholic, and it shapes what I choose
        to work on and how I spend the time around it. I served as vice chair of the
        Fisher Society, the Catholic student society at Cambridge, and spent a year
        leading a Confirmation group for twelve- to fourteen-year-olds at Our Lady and
        the English Martyrs.
      </Typography>

      <Typography variant="body1" paragraph>
        I played football for the Catholic chaplaincy side, which I co-captained through
        an undefeated 2025–26 season, and for Trinity as an undergraduate, along with a
        few years of ultimate frisbee. These days I mostly run.
      </Typography>

      <Typography variant="body1" paragraph>
        Teaching runs through most of what I do outside engineering. I taught mathematics
        in Lima from 2021, went on to coach competitive programming at Xplain and then
        for the competitive programming society at UTEC, the University of Engineering
        and Technology in Lima, and mentored two students through selection for the European
        Girls' Olympiad in Informatics.
      </Typography>

      <Box sx={{ mt: 6 }}>
        <Typography variant="overline" component="p">
          In short
        </Typography>
        <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
          Quick facts about me
        </Typography>
        <Box aria-hidden sx={{ width: 48, height: 2, backgroundColor: palette.flame, mb: 4 }} />

        {/* md={3} so all four sit on one row — md={4} totalled 16 columns and
            wrapped as 3 + 1. */}
        <Grid container spacing={4} justifyContent="center">
          {quickFacts.map((fact, index) => (
            <Grid item key={index} xs={12} sm={6} md={3} sx={{ textAlign: 'center' }}>
              {fact.icon}
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 1, mb: 0.5 }}>
                {fact.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {fact.description}
              </Typography>
              {fact.extra && <Box sx={{ mt: 1.5 }}>{fact.extra}</Box>}
            </Grid>
          ))}
        </Grid>
      </Box>
    </PageSurface>
  );
}

export default About;
