// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import * as React from 'react';
import { useEffect } from 'react';
import { PlasmicHomepage } from './plasmic/baryon/PlasmicHomepage';
import ThreeScene from '../ThreeScene';

function Homepage_(props, ref) {
  // Use PlasmicHomepage to render this component as it was
  // designed in Plasmic, by activating the appropriate variants,
  // attaching the appropriate event handlers, etc.  You
  // can also install whatever React hooks you need here to manage state or
  // fetch data.
  //
  // Props you can pass into PlasmicHomepage are:
  // 1. Variants you want to activate,
  // 2. Contents for slots you want to fill,
  // 3. Overrides for any named node in the component to attach behavior and data,
  // 4. Props to set on the root node.
  //
  // By default, we are just piping all HomepageProps here, but feel free
  // to do whatever works for you.
  // Dynamically load scripts and setup exports when the component mounts

  return (
    <div>
      <ThreeScene />
      <PlasmicHomepage visualizerDesktop={{ ref }} {...props} />
    </div>
  );
}

const Homepage = React.forwardRef(Homepage_);

export default Homepage;
