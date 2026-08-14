import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return <div style={{display:"grid",placeItems:"center",minHeight:"60vh"}}><SignUp path="/sign-up" routing="path" signInUrl="/sign-in" /></div>;
}
