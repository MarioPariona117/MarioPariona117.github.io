import React from 'react';
import { SvgIcon } from '@mui/material';

const rosarySize = 4.5;
const bigBeadSize = 3.5;
const smallBeadSize = 3;
const RosaryIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 100 100">
    {/* Beads around the rosary (outer loop) */}
    <circle cx="50" cy="10" r={bigBeadSize} fill="#1976d2" />  {/* Top center */}
    <circle cx="60" cy="12" r={bigBeadSize} fill="#1976d2" />  {/* Right upper */}
    <circle cx="70" cy="20" r={bigBeadSize} fill="#1976d2" />  {/* Right */}
    <circle cx="76" cy="32" r={bigBeadSize} fill="#1976d2" />  {/* Bottom right */}
    <circle cx="80" cy="46" r={bigBeadSize} fill="#1976d2" />  {/* Bottom right */}
    <circle cx="76" cy="60" r={bigBeadSize} fill="#1976d2" />  {/* Bottom right */}
    <circle cx="70" cy="70" r={bigBeadSize} fill="#1976d2" />  {/* Right */}
    <circle cx="60" cy="78" r={bigBeadSize} fill="#1976d2" />  {/* Right lower */}
    <circle cx="50" cy="80" r={bigBeadSize} fill="#1976d2" />  {/* Bottom center */}
    <circle cx="40" cy="78" r={bigBeadSize} fill="#1976d2" />  {/* Left lower */}
    <circle cx="30" cy="70" r={bigBeadSize} fill="#1976d2" />  {/* Left */}
    <circle cx="24" cy="60" r={bigBeadSize} fill="#1976d2" />  {/* Left */}
    <circle cx="20" cy="46" r={bigBeadSize} fill="#1976d2" />  {/* Left */}
    <circle cx="24" cy="32" r={bigBeadSize} fill="#1976d2" />  {/* Left */}
    <circle cx="30" cy="20" r={bigBeadSize} fill="#1976d2" />  {/* Left upper */}
    <circle cx="40" cy="12" r={bigBeadSize} fill="#1976d2" />  {/* Left upper */}

    {/* Smaller beads inside */}
    <circle cx="50" cy="20" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="55" cy="26" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="60" cy="34" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="62" cy="42" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="60" cy="50" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="55" cy="58" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="50" cy="64" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="45" cy="58" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="40" cy="50" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="38" cy="42" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="40" cy="34" r={smallBeadSize} fill="#5cafe2" />
    <circle cx="45" cy="26" r={smallBeadSize} fill="#5cafe2" />

    {/* Cross of the rosary */}
    <rect x={50 - rosarySize / 2} y={80 + bigBeadSize} width={rosarySize} height={rosarySize * 4} fill="#1976d2" /> {/* Vertical */}
    <rect x={50 - (3 * rosarySize) / 2} y={80 + bigBeadSize + rosarySize} width={rosarySize * 3} height={rosarySize} fill="#1976d2" /> {/* Horizontal */}

    {/* Rosary connecting chain */}
    <line x1="50" y1="64" x2="50" y2="80" stroke="#1976d2" strokeWidth="1.5" strokeLinecap="round" />
  </SvgIcon>
);

export default RosaryIcon;