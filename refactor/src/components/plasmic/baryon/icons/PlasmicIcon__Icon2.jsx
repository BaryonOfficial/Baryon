// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function Icon2Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 25 26"}
      height={"1em"}
      width={"1em"}
      style={{
        fill: "currentcolor",
        ...(style || {}),
      }}
      className={classNames("plasmic-default__svg", className)}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M24.658 21.616l-4.868-4.868a1.17 1.17 0 00-.83-.342h-.796a10.107 10.107 0 002.148-6.25C20.313 4.546 15.768 0 10.156 0 4.546 0 0 4.546 0 10.156s4.546 10.156 10.156 10.156c2.359 0 4.527-.8 6.25-2.148v.796c0 .313.122.61.342.83l4.868 4.868a1.167 1.167 0 001.655 0l1.382-1.382a1.177 1.177 0 00.005-1.66zm-14.502-5.21a6.246 6.246 0 01-6.25-6.25 6.246 6.246 0 016.25-6.25 6.246 6.246 0 016.25 6.25 6.246 6.246 0 01-6.25 6.25z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default Icon2Icon;
/* prettier-ignore-end */
