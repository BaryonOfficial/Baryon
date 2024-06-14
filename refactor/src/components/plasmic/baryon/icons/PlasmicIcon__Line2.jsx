// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function Line2Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 363 18"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M.6 9a8.4 8.4 0 1016.8 0A8.4 8.4 0 00.6 9zM361 10.575a1.575 1.575 0 100-3.15v3.15zm-352 0h352v-3.15H9v3.15z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default Line2Icon;
/* prettier-ignore-end */
