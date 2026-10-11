import { redirect } from 'next/navigation';

/** `/today` moved into the tasks page; the local today-api it used is retired. */
export default function Page() {
  redirect('/tasks');
}
