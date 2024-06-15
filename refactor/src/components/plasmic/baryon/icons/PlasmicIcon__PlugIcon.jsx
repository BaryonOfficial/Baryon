// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function PlugIconIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 20 31"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M7.68 0a.96.96 0 01.96.96v4.8h5.76V.96a.96.96 0 111.92 0v4.8h1.92a.96.96 0 01.96.96v5.76a6.72 6.72 0 01-6.72 6.72c-.004.833-.02 1.622-.077 2.342-.079.987-.242 1.926-.608 2.734a3.994 3.994 0 01-1.863 1.974c-.86.438-1.928.63-3.212.63-1.916 0-3.091.634-3.79 1.379a3.686 3.686 0 00-1.01 2.461H0c0-1.183.445-2.625 1.53-3.779 1.108-1.175 2.811-1.981 5.19-1.981 1.116 0 1.847-.169 2.339-.42.462-.237.768-.576.986-1.056.233-.511.371-1.193.442-2.093.052-.653.067-1.379.071-2.191a6.72 6.72 0 01-6.718-6.72V6.72a.96.96 0 01.96-.96h1.92V.96A.96.96 0 017.68 0zM5.76 7.68v4.8a4.8 4.8 0 004.8 4.8h1.92a4.8 4.8 0 004.8-4.8v-4.8H5.76z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default PlugIconIcon;
/* prettier-ignore-end */
